import { TelegramClient, Api, sessions } from 'telegram';
const StringSession = sessions.StringSession;
import { dbService } from './dbService';
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


  public getStatus(): TelegramAuthStatus {
    return this.authStatus;
  }

  public async init(): Promise<void> {
    const savedApiId = dbService.getSetting('api_id', '28923');
    const savedApiHash = dbService.getSetting('api_hash', 'c671dcb553990caaa73');
    const savedAppTitle = dbService.getSetting('app_title', 'krishnaldrbot');
    const savedShortName = dbService.getSetting('short_name', 'krishnaebot');
    const savedEnv = dbService.getSetting('server_environment', 'production') as 'production' | 'test';
    const savedSession = dbService.getSetting('session_string', '');

    this.apiId = parseInt(savedApiId, 10) || 28923;
    this.apiHash = savedApiHash || 'c671dcb553990caaa73';
    this.appTitle = savedAppTitle || 'krishnaldrbot';
    this.shortName = savedShortName || 'krishnaebot';
    this.serverEnvironment = savedEnv;
    this.sessionString = savedSession;

    if (this.sessionString && this.apiId && this.apiHash) {
      try {
        const session = new StringSession(this.sessionString);
        this.client = new TelegramClient(session, this.apiId, this.apiHash, {
          connectionRetries: 5,
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
    if (!this.apiId || !this.apiHash) throw new Error('API ID and API Hash must be configured first.');

    const cleanPhone = phoneNumber.trim().replace(/[\s\-\(\)]/g, '');
    if (!cleanPhone.startsWith('+')) {
      throw new Error('Phone number must include international country code prefix (e.g. +9197987749794).');
    }

    this.phoneNumber = cleanPhone;
    const session = new StringSession('');
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      testServers: this.serverEnvironment === 'test'
    });
    await this.client.connect();

    try {
      const res = await this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, cleanPhone);
      this.phoneCodeHash = res.phoneCodeHash;
      this.authStatus = { isAuthenticated: false, step: 'WAITING_CODE' };
      return this.authStatus;
    } catch (err: any) {
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

    const entity = await this.client.getEntity(chatId);

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
      if (!msg || !msg.media) continue;
      const media = msg.media as any;
      let filename = '';
      let mime_type = 'application/octet-stream';
      let size = 0;
      let media_type: MediaType = 'unknown';

      if (media.document) {
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
      } else if (media.photo) {
        media_type = 'photo';
        mime_type = 'image/jpeg';
        filename = `photo_${msg.id}.jpg`;
        size = Number(media.photo.sizes ? media.photo.sizes[media.photo.sizes.length - 1]?.size || 0 : 0);
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
        text: msg.message || ''
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

  public async fetchMessages(chatId: string, fromId?: number, toId?: number, limit: number = 200) {
    if (!this.client) throw new Error('Telegram client is not connected.');
    const entity = await this.client.getEntity(chatId);
    return this.client.getMessages(entity, {
      limit,
      minId: fromId ? fromId - 1 : undefined,
      maxId: toId ? toId + 1 : undefined
    });
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
    const entity = await this.client.getEntity(chatId);
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

    await this.client.downloadMedia(message as any, {
      outputFile: targetTempPath,
      progressCallback: (downloaded: any, total: any) => {
        checkAborted();
        onProgress(Number(downloaded) + startOffset, Number(total));
      }
    });
  }
}

export const telegramClient = new TelegramClientService();

