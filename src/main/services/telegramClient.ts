import { TelegramClient, Api, sessions } from 'telegram';
const StringSession = sessions.StringSession;
import bigInt from 'big-integer';
import { dbService } from './dbService';
import { downloadManager } from './downloadManager';
import { TelegramAuthStatus, TelegramChat, TelegramUser, GroupMessageItem, MediaType } from '../../types';
import path from 'path';
import fs from 'fs';

class TelegramClientService {
  private client: TelegramClient | null = null;
  private apiId: number = 28923;
  private apiHash: string = 'c671dcb553990caaa73';
  private appTitle: string = 'krishnaldrbot';
  private shortName: string = 'krishnaebot';
  private serverEnvironment: 'production' | 'test' = 'production';
  private sessionString: string = '';
  private phoneNumber: string = '';
  private phoneCodeHash: string = '';
  private authStatus: TelegramAuthStatus = { isAuthenticated: false, step: 'LOGGED_OUT' };

  // Per-item abort controllers and state for cancellation
  private abortControllers: Map<string, AbortController> = new Map();
  private abortedItemIds: Set<string> = new Set();
  private entityCache: Map<string, any> = new Map();

  public async handleFloodWait<T>(fn: () => Promise<T>, maxRetries: number = 5): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const errMsg = String(err?.errorMessage || err?.message || err);
        const match = errMsg.match(/FLOOD_WAIT_(\d+)/i) || (err?.seconds ? [null, String(err.seconds)] : null);
        if (match && match[1]) {
          const waitSecs = parseInt(match[1], 10) || 5;
          console.warn(`[TelegramClient] Rate limited (FLOOD_WAIT_${waitSecs}s). Pausing automatically before retry...`);
          await new Promise((resolve) => setTimeout(resolve, (waitSecs + 1) * 1000));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Max FLOOD_WAIT retries exceeded');
  }


  public getStatus(): TelegramAuthStatus {
    return this.authStatus;
  }

  public getCredentials() {
    return {
      apiId: dbService.getSetting('api_id', ''),
      apiHash: dbService.getSetting('api_hash', ''),
      phoneNumber: dbService.getSetting('phone_number', '')
    };
  }

  public async init(): Promise<void> {
    const savedApiId = dbService.getSetting('api_id', '');
    const savedApiHash = dbService.getSetting('api_hash', '');
    const savedAppTitle = dbService.getSetting('app_title', 'TeleFlow Desktop');
    const savedShortName = dbService.getSetting('short_name', 'teleflow');
    const savedEnv = dbService.getSetting('server_environment', 'production') as 'production' | 'test';
    const savedSession = dbService.getSetting('session_string', '');

    this.apiId = parseInt(savedApiId, 10) || 0;
    this.apiHash = savedApiHash || '';
    this.appTitle = savedAppTitle;
    this.shortName = savedShortName;
    this.serverEnvironment = savedEnv;
    this.sessionString = savedSession;

    if (this.sessionString && this.apiId && this.apiHash) {
      try {
        const session = new StringSession(this.sessionString);
        this.client = new TelegramClient(session, this.apiId, this.apiHash, {
          connectionRetries: 5,
          deviceModel: 'TeleFlow Desktop Client',
          systemVersion: 'Windows 10/11',
          appVersion: '1.0.0',
          testServers: this.serverEnvironment === 'test'
        });
        await this.client.connect();
        const me = await this.client.getMe() as any;
        if (me) {
          const user: TelegramUser = {
            id: me.id ? me.id.toString() : '',
            firstName: me.firstName || '',
            lastName: me.lastName || '',
            username: me.username || '',
            phone: me.phone || ''
          };
          this.authStatus = { isAuthenticated: true, step: 'LOGGED_IN', user };
          // Pre-warm GramJS entity cache on app startup so resume/retry works seamlessly
          this.getDialogs().catch(e => console.warn('[TelegramClient] Startup dialog pre-warm warning:', e));
        }
      } catch (err: any) {
        console.error('Failed to restore Telegram session:', err);
        this.authStatus = { isAuthenticated: false, step: 'LOGGED_OUT', error: 'Session expired or invalid credentials' };
      }
    }
  }

  public async configureCredentials(
    apiId: number, apiHash: string, appTitle?: string, shortName?: string, serverEnvironment?: 'production' | 'test'
  ): Promise<void> {
    this.apiId = apiId;
    this.apiHash = apiHash;
    if (appTitle) this.appTitle = appTitle;
    if (shortName) this.shortName = shortName;
    if (serverEnvironment) this.serverEnvironment = serverEnvironment;

    dbService.setSetting('api_id', String(apiId));
    dbService.setSetting('api_hash', apiHash);
    dbService.setSetting('app_title', this.appTitle);
    dbService.setSetting('short_name', this.shortName);
    dbService.setSetting('server_environment', this.serverEnvironment);
  }

  public async sendCode(phoneNumber: string): Promise<TelegramAuthStatus> {
    if (!this.apiId || !this.apiHash) {
      throw new Error('API ID and API Hash must be configured first. Get your keys at https://my.telegram.org');
    }

    const cleanPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
    if (!cleanPhone.startsWith('+')) {
      throw new Error('Phone number must include international country code prefix (e.g. +9197987749794).');
    }

    this.phoneNumber = cleanPhone;
    dbService.setSetting('phone_number', cleanPhone);

    if (this.client) {
      try { await this.client.disconnect(); } catch (e) {}
      this.client = null;
    }

    const session = new StringSession('');
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      deviceModel: 'TeleFlow Desktop Client',
      systemVersion: 'Windows 10/11',
      appVersion: '1.0.0',
      testServers: this.serverEnvironment === 'test'
    });
    await this.client.connect();

    try {
      console.log(`[TelegramAuth] Sending OTP code to ${cleanPhone} with API ID ${this.apiId}...`);
      const res = await this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, cleanPhone);
      this.phoneCodeHash = res.phoneCodeHash;
      this.authStatus = { isAuthenticated: false, step: 'WAITING_CODE' };
      console.log('[TelegramAuth] OTP code sent successfully! phoneCodeHash received.');
      return this.authStatus;
    } catch (err: any) {
      console.error('[TelegramAuth] Error sending OTP code:', err);
      const friendlyErr = this.formatTelegramError(err);
      this.authStatus = { isAuthenticated: false, step: 'LOGGED_OUT', error: friendlyErr };
      throw new Error(friendlyErr);
    }
  }

  public async signIn(code: string): Promise<TelegramAuthStatus> {
    if (!this.client || !this.phoneNumber || !this.phoneCodeHash) {
      throw new Error('Verification session lost. Please click Send Code again.');
    }

    try {
      await this.client.invoke(new Api.auth.SignIn({
        phoneNumber: this.phoneNumber,
        phoneCodeHash: this.phoneCodeHash,
        phoneCode: code.trim()
      }));

      const me = await this.client.getMe() as any;
      const savedSession = this.client.session.save() as unknown as string;
      dbService.setSetting('session_string', savedSession);

      const user: TelegramUser = {
        id: me.id ? me.id.toString() : '',
        firstName: me.firstName || '',
        lastName: me.lastName || '',
        username: me.username || '',
        phone: me.phone || ''
      };
      this.authStatus = { isAuthenticated: true, step: 'LOGGED_IN', user };
      return this.authStatus;
    } catch (err: any) {
      const errMsg = String(err.errorMessage || err.message || err).toUpperCase();
      if (errMsg.includes('SESSION_PASSWORD_NEEDED')) {
        this.authStatus = { isAuthenticated: false, step: 'WAITING_PASSWORD' };
        return this.authStatus;
      }
      throw new Error(this.formatTelegramError(err));
    }
  }

  public async checkPassword(password: string): Promise<TelegramAuthStatus> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      await this.client.signInWithPassword(
        { apiId: this.apiId, apiHash: this.apiHash },
        {
          password: () => Promise.resolve(password),
          onError: (err: any) => Promise.resolve(false)
        }
      );

      const me = await this.client.getMe() as any;
      const savedSession = this.client.session.save() as unknown as string;
      dbService.setSetting('session_string', savedSession);

      const user: TelegramUser = {
        id: me.id ? me.id.toString() : '',
        firstName: me.firstName || '',
        lastName: me.lastName || '',
        username: me.username || '',
        phone: me.phone || ''
      };
      this.authStatus = { isAuthenticated: true, step: 'LOGGED_IN', user };
      return this.authStatus;
    } catch (err: any) {
      throw new Error(this.formatTelegramError(err));
    }
  }

  private formatTelegramError(err: any): string {
    const raw = (err.errorMessage || err.message || String(err)).toUpperCase();
    if (raw.includes('API_ID_INVALID') || raw.includes('API_ID_PUBLISHED_FLOOD'))
      return 'API ID / API Hash is invalid. Please log into https://my.telegram.org/auth to get your real keys.';
    if (raw.includes('PHONE_NUMBER_INVALID'))
      return 'Invalid phone number format. Include country prefix (e.g. +9197987749794).';
    if (raw.includes('PHONE_CODE_INVALID'))
      return 'The 5-digit code is incorrect. Check your Telegram app.';
    if (raw.includes('PHONE_CODE_EXPIRED'))
      return 'Verification code expired. Click Send Code again.';
    if (raw.includes('PHONE_NUMBER_UNREGISTERED'))
      return 'This phone number is not registered on Telegram.';
    if (raw.includes('PASSWORD_HASH_INVALID'))
      return 'Incorrect 2FA password. Please try again.';
    if (raw.includes('FLOOD_WAIT'))
      return 'Too many login attempts. Please wait a few minutes before trying again.';
    return err.errorMessage || err.message || 'Telegram authentication failed';
  }

  public async logout(): Promise<void> {
    if (this.client) {
      try { await this.client.invoke(new Api.auth.LogOut()); } catch (e) {}
      this.client = null;
    }
    dbService.setSetting('session_string', '');
    this.authStatus = { isAuthenticated: false, step: 'LOGGED_OUT' };
  }

  public async getDialogs(): Promise<TelegramChat[]> {
    if (!this.client) throw new Error('Telegram client is not connected.');
    const dialogs = await this.client.getDialogs({ limit: 100 });
    return dialogs.map((d) => {
      let type: 'channel' | 'group' | 'user' | 'chat' = 'chat';
      if (d.isChannel) type = 'channel';
      else if (d.isGroup) type = 'group';
      else if (d.isUser) type = 'user';
      return {
        id: d.id ? d.id.toString() : '0',
        title: d.title || d.name || 'Unnamed Chat',
        username: (d.entity as any)?.username || '',
        type,
        unreadCount: d.unreadCount || 0,
        hasMedia: true,
        participantsCount: (d.entity as any)?.participantsCount || 0
      };
    });
  }

  public async searchChats(query: string): Promise<TelegramChat[]> {
    if (!this.client) throw new Error('Telegram client is not connected.');
    if (!query || query.trim() === '') return this.getDialogs();

    try {
      const result = await this.client.invoke(new Api.contacts.Search({ q: query, limit: 20 }));
      const chats: TelegramChat[] = [];
      if (result.chats) {
        for (const c of result.chats) {
          const chatEntity = c as any;
          let type: 'channel' | 'group' | 'user' | 'chat' = 'group';
          if (chatEntity.broadcast) type = 'channel';
          else if (chatEntity.megagroup) type = 'group';
          chats.push({
            id: chatEntity.id ? chatEntity.id.toString() : '0',
            title: chatEntity.title || 'Unnamed Group',
            username: chatEntity.username || '',
            type,
            unreadCount: 0,
            hasMedia: true,
            participantsCount: chatEntity.participantsCount || 0
          });
        }
      }
      return chats;
    } catch (err) {
      console.warn('Search contacts failed, falling back to local dialog search:', err);
      const dialogs = await this.getDialogs();
      return dialogs.filter((d) =>
        d.title.toLowerCase().includes(query.toLowerCase()) ||
        (d.username && d.username.toLowerCase().includes(query.toLowerCase()))
      );
    }
  }

  public async inspectGroupMessages(
    chatId: string,
    limit: number = 100,
    fromMsgId?: number,
    toMsgId?: number,
    offsetId?: number   // for pagination: pass the smallest message_id from the previous page
  ): Promise<{ items: GroupMessageItem[]; hasMore: boolean; oldestMsgId: number | null }> {
    if (!this.client) throw new Error('Telegram client is not connected.');

    const entity = await this.resolveEntity(chatId);

    // GramJS: maxId means "get messages with ID < maxId" (i.e., older messages)
    // offsetId is the oldest message ID from the previous page — we pass it as maxId to go back further
    const effectiveMaxId = offsetId ?? (toMsgId ? toMsgId + 1 : undefined);
    const effectiveMinId = fromMsgId ? fromMsgId - 1 : undefined;

    const messages = await this.client.getMessages(entity, {
      limit,
      minId: effectiveMinId,
      maxId: effectiveMaxId
    });

    const mediaItems: GroupMessageItem[] = [];

    for (const msg of messages) {
      if (!msg) continue;
      const media = msg.media as any;
      let filename = '';
      let mime_type = 'application/octet-stream';
      let size = 0;
      let media_type: MediaType = 'unknown';
      let text_content = msg.message || '';

      if (media && media.document) {
        const doc = media.document;
        size = Number(doc.size || 0);
        mime_type = doc.mimeType || 'application/octet-stream';
        if (doc.attributes) {
          for (const attr of doc.attributes) {
            if (attr.fileName) { filename = attr.fileName; break; }
          }
        }
        if (mime_type.startsWith('video/')) media_type = 'video';
        else if (mime_type.startsWith('audio/')) media_type = 'audio';
        else media_type = 'document';
      } else if (media && media.photo) {
        media_type = 'photo';
        mime_type = 'image/jpeg';
        filename = `photo_${msg.id}.jpg`;
        size = Number(media.photo.sizes ? media.photo.sizes[media.photo.sizes.length - 1]?.size || 0 : 0);
      } else {
        // Non-media message (text, URL link, channel post)
        const hasUrl = /https?:\/\/[^\s]+/i.test(text_content);
        media_type = hasUrl ? 'link' : 'text';
        mime_type = 'text/plain';
        filename = `${this.generateTextTitle(text_content, msg.id)}.txt`;
        size = Buffer.byteLength(text_content, 'utf-8');
      }

      if (!filename) filename = `telegram_${media_type}_${msg.id}.bin`;

      mediaItems.push({
        message_id: msg.id,
        date: new Date((msg.date || 0) * 1000).toLocaleDateString(),
        sender_name: (msg.sender as any)?.firstName || 'Member',
        media_type,
        filename,
        size,
        mime_type,
        text: text_content,
        text_content
      });
    }

    // Sort oldest → newest so sequence numbers are deterministic
    mediaItems.sort((a, b) => a.message_id - b.message_id);

    // hasMore: if we got a full page (limit items from Telegram, including non-media), there may be more
    const hasMore = messages.length >= limit;
    const oldestMsgId = messages.length > 0
      ? Math.min(...messages.map((m: any) => m.id))
      : null;

    return { items: mediaItems, hasMore, oldestMsgId };
  }

  private generateTextTitle(text: string, msgId: number): string {
    if (!text || text.trim() === '') return `message_${msgId}`;
    const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
    const clean = firstLine.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
    if (clean.length > 0) {
      return clean.substring(0, 45).replace(/\.+$/, '');
    }
    return `message_${msgId}`;

  }

  public async resolveEntity(chatId: string) {
    if (!this.client) throw new Error('Telegram client is not connected.');
    if (this.entityCache.has(chatId)) {
      return this.entityCache.get(chatId);
    }

    let targetId: any = chatId;
    // If raw numeric string without prefix (e.g. "3429930878"), add -100 prefix so GramJS knows it is a Channel, not a User
    if (/^\d+$/.test(chatId)) {
      targetId = `-100${chatId}`;
    }

    try {
      const entity = await this.client.getEntity(targetId);
      if (entity) this.entityCache.set(chatId, entity);
      return entity;
    } catch (err: any) {
      console.warn(`[EntityResolver] Initial resolution failed for ${targetId} (${err.message}). Pre-warming dialogs cache...`);

      // Populate GramJS internal entity cache from Telegram
      try {
        await this.client.getDialogs({ limit: 100 });
      } catch (dErr) {
        console.warn(`[EntityResolver] Dialog pre-warm warning:`, dErr);
      }

      try {
        const entity = await this.client.getEntity(targetId);
        if (entity) this.entityCache.set(chatId, entity);
        return entity;
      } catch (retryErr) {
        // Fallback to original raw ID
        const entity = await this.client.getEntity(chatId);
        if (entity) this.entityCache.set(chatId, entity);
        return entity;
      }
    }
  }

  public async getMessagesByIds(chatId: string, ids: number[]) {
    if (!this.client) throw new Error('Telegram client is not connected.');
    const entity = await this.resolveEntity(chatId);
    return this.client.getMessages(entity, { ids });
  }

  public async fetchMessages(chatId: string, fromId?: number, toId?: number, limit: number = 0) {
    if (!this.client) throw new Error('Telegram client is not connected.');
    const entity = await this.resolveEntity(chatId);

    // Single batch fetch for explicit small preview limits
    if (limit > 0 && limit <= 500) {
      return this.client.getMessages(entity, {
        limit,
        minId: fromId ? fromId - 1 : undefined,
        maxId: toId ? toId + 1 : undefined
      });
    }

    // Full channel / range history fetch (limit === 0)
    const allMessages: any[] = [];
    let currentOffsetId: number | undefined = toId ? toId + 1 : undefined;
    const minId = fromId ? fromId - 1 : undefined;

    while (true) {
      const batch = await this.client.getMessages(entity, {
        limit: 100,
        minId: minId,
        maxId: currentOffsetId
      });

      if (!batch || batch.length === 0) break;

      allMessages.push(...batch);

      const oldestInBatch = Math.min(...batch.map((m: any) => m.id));

      if (minId && oldestInBatch <= minId) break;
      if (batch.length < 100) break;

      currentOffsetId = oldestInBatch;
    }

    return allMessages;
  }

  public isDownloadAborted(itemId: string): boolean {
    return this.abortedItemIds.has(itemId);
  }

  public registerAbortController(itemId: string): AbortController {
    this.abortedItemIds.delete(itemId);
    const controller = new AbortController();
    this.abortControllers.set(itemId, controller);
    return controller;
  }

  public abortDownload(itemId: string): void {
    this.abortedItemIds.add(itemId);
    const controller = this.abortControllers.get(itemId);
    if (controller) {
      controller.abort();
    }
  }

  public unregisterAbortController(itemId: string): void {
    this.abortControllers.delete(itemId);
  }

  public clearAbortState(itemId?: string): void {
    if (itemId) {
      this.abortedItemIds.delete(itemId);
      this.abortControllers.delete(itemId);
    } else {
      this.abortedItemIds.clear();
      this.abortControllers.clear();
    }
  }

  public async downloadFileChunk(
    chatId: string,
    messageId: number,
    targetTempPath: string,
    onProgress: (downloadedBytes: number, totalBytes: number) => void,
    itemId?: string,
    startOffset: number = 0
  ): Promise<void> {
    if (!this.client) throw new Error('Telegram client is not connected.');

    const checkAborted = () => {
      if (itemId && (this.abortedItemIds.has(itemId) || this.abortControllers.get(itemId)?.signal.aborted)) {
        throw new Error('Download cancelled by user');
      }
    };

    checkAborted();
    const entity = await this.resolveEntity(chatId);
    checkAborted();

    const messages = await this.client.getMessages(entity, { ids: [messageId] });
    if (!messages || !messages[0] || !messages[0].media) {
      throw new Error(`Message #${messageId} does not contain downloadable media.`);
    }

    const message = messages[0];
    const tempDir = path.dirname(targetTempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    checkAborted();

    await this.downloadMediaTurbo(
      message,
      targetTempPath,
      onProgress,
      checkAborted,
      startOffset,
      16,
      entity,
      messageId,
      itemId
    );
  }

  public async downloadMediaTurbo(
    message: any,
    targetTempPath: string,
    onProgress: (downloadedBytes: number, totalBytes: number) => void,
    checkAborted: () => void,
    startOffset: number = 0,
    workers: number = 16,
    entity?: any,
    messageId?: number,
    itemId?: string
  ): Promise<void> {
    if (!this.client) throw new Error('Telegram client is not connected.');
    if (!message || !message.media) throw new Error('Message does not contain media.');

    // Align startOffset down to 4096-byte (4KB) boundary for GramJS/Telegram API compliance
    let accumulatedBytes = Math.floor(startOffset / 4096) * 4096;
    if (accumulatedBytes < startOffset && fs.existsSync(targetTempPath)) {
      try {
        fs.truncateSync(targetTempPath, accumulatedBytes);
        console.log(`[DownloadTurbo] Truncated partial file to 4KB aligned offset: ${accumulatedBytes} bytes`);
      } catch (e) {
        console.warn('[DownloadTurbo] File alignment truncation warning:', e);
      }
    }

    let retries = 0;
    const maxRetries = 5;
    let currentMessage = message;

    while (retries < maxRetries) {
      try {
        checkAborted();

        const media = currentMessage.media;
        let location: any = null;
        let dcId: number | undefined = undefined;
        let fileSize: number = 0;

        if (media.document && media.document.id) {
          const doc = media.document;
          dcId = doc.dcId;
          fileSize = Number(doc.size || 0);
          location = new Api.InputDocumentFileLocation({
            id: doc.id,
            accessHash: doc.accessHash,
            fileReference: doc.fileReference,
            thumbSize: ''
          });
        } else if (media.photo && media.photo.id) {
          const photo = media.photo;
          dcId = photo.dcId;
          const largestSize = photo.sizes ? photo.sizes[photo.sizes.length - 1] : null;
          fileSize = Number(largestSize?.size || 0);
          location = new Api.InputPhotoFileLocation({
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference,
            thumbSize: largestSize?.type || 'x'
          });
        }

        let writeStream: fs.WriteStream | null = null;
        let iter: any = null;

        try {
          checkAborted();
          writeStream = fs.createWriteStream(targetTempPath, {
            flags: accumulatedBytes > 0 ? 'a' : 'w'
          });

          iter = this.client.iterDownload({
            file: location || currentMessage.media || currentMessage,
            offset: bigInt(accumulatedBytes),
            requestSize: 512 * 1024,
            dcId: dcId,
            fileSize: fileSize ? (bigInt(fileSize) as any) : undefined
          });

          for await (const chunk of iter as any) {
            // Check abort signal immediately on every chunk
            if (itemId && (this.abortedItemIds.has(itemId) || this.abortControllers.get(itemId)?.signal.aborted)) {
              if (iter && typeof iter.return === 'function') {
                try { await iter.return(); } catch (e) {}
              }
              throw new Error('Download cancelled by user');
            }

            // Enforce max download speed throttling if configured
            const maxSpeedBps = downloadManager.getSpeedLimit();
            if (maxSpeedBps > 0 && chunk.length > 0) {
              const delayMs = (chunk.length / maxSpeedBps) * 1000;
              if (delayMs > 5) {
                await new Promise((res) => setTimeout(res, Math.min(delayMs, 1000)));
              }
            }

            await new Promise<void>((resolve, reject) => {
              const ok = writeStream!.write(chunk, (err) => {
                if (err) reject(err);
                else resolve();
              });
              if (!ok) {
                writeStream!.once('drain', resolve);
              }
            });

            accumulatedBytes += chunk.length;
            onProgress(accumulatedBytes, fileSize || accumulatedBytes);
          }
        } finally {
          if (iter && typeof iter.return === 'function') {
            try { await iter.return(); } catch (e) {}
          }
          if (writeStream) {
            await new Promise<void>((resolve) => {
              writeStream!.end(() => resolve());
            });
          }
        }

        // Successfully completed chunk iteration without errors
        break;

      } catch (err: any) {
        const errMsg = String(err?.errorMessage || err?.message || err);

        // Don't retry if aborted by user
        if (errMsg.toLowerCase().includes('cancel') || errMsg.toLowerCase().includes('abort')) {
          throw err;
        }

        retries++;
        console.warn(`[DownloadTurbo] Intercepted transfer error (Attempt ${retries}/${maxRetries}) at ${accumulatedBytes} bytes: ${errMsg}`);

        if (retries >= maxRetries) {
          throw err;
        }

        // Align byte offset down to 4KB boundary before retry
        accumulatedBytes = Math.floor(accumulatedBytes / 4096) * 4096;
        if (fs.existsSync(targetTempPath)) {
          try {
            fs.truncateSync(targetTempPath, accumulatedBytes);
          } catch (e) {}
        }

        // If file reference expired at ~90%, re-fetch fresh message from Telegram
        const isRefExpired = /FILE_REFERENCE/i.test(errMsg) || /REF_EXPIRED/i.test(errMsg) || /LOCATION_INVALID/i.test(errMsg);
        if (isRefExpired && entity && messageId) {
          console.log(`[DownloadTurbo] File reference expired at ${accumulatedBytes} bytes. Re-fetching fresh media token from Telegram...`);
          try {
            const freshMessages = await this.client.getMessages(entity, { ids: [messageId] });
            if (freshMessages && freshMessages[0] && freshMessages[0].media) {
              currentMessage = freshMessages[0];
            }
          } catch (mErr) {
            console.warn('[DownloadTurbo] Failed to re-fetch message reference:', mErr);
          }
        }

        // Wait 2 seconds before retrying
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
  }
}

export const telegramClient = new TelegramClientService();

