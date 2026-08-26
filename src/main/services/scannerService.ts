import { telegramClient } from './telegramClient';
import { dbService } from './dbService';
import { DownloadItem, DownloadSession, ScanOptions, MediaType } from '../../types';
import path from 'path';
import { app } from 'electron';
import { downloadManager } from './downloadManager';
import { parseTelegramLink } from '../utils/telegramLink';


export class ScannerService {

  public async scanAndEnqueue(options: ScanOptions): Promise<DownloadSession> {
    const {
      chat_id,
      chat_title,
      from_message_id,
      to_message_id,
      media_types,
      session_title = `Session - ${chat_title}`,
      destination_path,
      download_mode = 'sequential',
      concurrency = 1
    } = options;

    // Parse potential Telegram message links (e.g. https://t.me/c/3429930878/642)
    const parsedFrom = parseTelegramLink(from_message_id);
    const parsedTo = parseTelegramLink(to_message_id);

    const effectiveFromId = parsedFrom.messageId ?? (typeof from_message_id === 'number' ? from_message_id : (from_message_id ? parseInt(String(from_message_id), 10) : undefined));
    const effectiveToId = parsedTo.messageId ?? (typeof to_message_id === 'number' ? to_message_id : (to_message_id ? parseInt(String(to_message_id), 10) : undefined));
    const effectiveChatId = parsedFrom.chatId || parsedTo.chatId || chat_id;

    let messages: any[] = [];

    // If specific message IDs were selected in UI
    if (options.selected_message_ids && options.selected_message_ids.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < options.selected_message_ids.length; i += chunkSize) {
        const chunkIds = options.selected_message_ids.slice(i, i + chunkSize);
        const chunkMsgs = await telegramClient.getMessagesByIds(effectiveChatId, chunkIds);
        if (chunkMsgs && chunkMsgs.length > 0) {
          messages.push(...chunkMsgs);
        }
      }
    } else {
      // Fetch ALL messages in channel / range (limit = 0 -> unlimited full fetch)
      messages = await telegramClient.fetchMessages(effectiveChatId, effectiveFromId, effectiveToId, 0);
    }

    // Process all valid messages in the fetched sequence (files, links, text posts)
    const validMessages = messages.filter((msg: any) => msg && msg.id);

    // CRITICAL REQUIREMENT: Sort messages strictly by Telegram message_id ascending
    validMessages.sort((a: any, b: any) => a.id - b.id);

    // Use settings default destination if not provided
    const settingsDefault = dbService.getSetting('default_destination', '');
    const effectiveDestination = destination_path || settingsDefault ||
      path.join(app ? app.getPath('downloads') : process.cwd(), 'TeleFlow', this.sanitizeFolderName(chat_title));
    const defaultBaseDir = effectiveDestination;

    const tempDir = path.join(defaultBaseDir, '.temp');

    const sessionId = `session_${Date.now()}`;
    const padding = Math.max(3, String(validMessages.length).length);

    const downloadItems: DownloadItem[] = [];

    // If user selected specific messages, filter to only those
    const selectedSet = options.selected_message_ids && options.selected_message_ids.length > 0
      ? new Set(options.selected_message_ids)
      : null;
    const filteredMessages = selectedSet
      ? validMessages.filter((msg: any) => selectedSet.has(msg.id))
      : validMessages;

    filteredMessages.forEach((msg: any, index: number) => {

      const seqNumber = index + 1;
      const formattedSeq = String(seqNumber).padStart(padding, '0');
      const mediaInfo = this.extractMediaDetails(msg);

      if (media_types && media_types.length > 0 && !media_types.includes(mediaInfo.media_type)) {
        return; // Skip if user filtered out this media type
      }

      const tempFileName = `${sessionId}_${msg.id}.part`;
      const tempPath = path.join(tempDir, tempFileName);

      const finalFileName = `${formattedSeq}_${this.sanitizeFilename(mediaInfo.filename)}`;
      const finalPath = path.join(defaultBaseDir, finalFileName);

      downloadItems.push({
        id: `item_${sessionId}_${msg.id}`,
        session_id: sessionId,
        chat_id: chat_id,
        chat_title: chat_title,
        message_id: msg.id,
        sequence_number: seqNumber,
        formatted_sequence: formattedSeq,
        media_type: mediaInfo.media_type,
        original_filename: mediaInfo.filename,
        extension: mediaInfo.extension,
        mime_type: mediaInfo.mime_type,
        telegram_file_id: String(msg.id),
        total_bytes: mediaInfo.size,
        downloaded_bytes: 0,
        speed_bps: 0,
        status: 'QUEUED',
        temp_path: tempPath,
        final_path: finalPath,
        text_content: mediaInfo.text_content,
        created_at: new Date().toISOString()
      });
    });

    const session: DownloadSession = {
      id: sessionId,
      title: session_title,
      chat_id,
      chat_title,
      from_message_id,
      to_message_id,
      destination_path: defaultBaseDir,
      add_sequence_prefix: true,
      sequence_padding: padding,
      download_mode,
      concurrency,
      created_at: new Date().toISOString(),
      status: 'ACTIVE',
      total_files: downloadItems.length,
      completed_files: 0,
      total_bytes: downloadItems.reduce((acc, i) => acc + i.total_bytes, 0),
      downloaded_bytes: 0
    };

    dbService.createSession(session);
    dbService.addDownloadItems(downloadItems);

    return session;
  }

  private extractMediaDetails(msg: any): { filename: string; extension: string; mime_type: string; size: number; media_type: MediaType; text_content?: string } {
    let filename = '';
    let extension = '.bin';
    let mime_type = 'application/octet-stream';
    let size = 0;
    let media_type: MediaType = 'unknown';
    const text_content = msg.message || '';

    const media = msg ? msg.media : null;

    if (media && media.document) {
      const doc = media.document;
      size = Number(doc.size || 0);
      mime_type = doc.mimeType || 'application/octet-stream';

      // Check document attributes for filename
      if (doc.attributes) {
        for (const attr of doc.attributes) {
          if (attr.fileName) {
            filename = attr.fileName;
            break;
          }
        }
      }

      if (mime_type.startsWith('video/')) media_type = 'video';
      else if (mime_type.startsWith('audio/')) media_type = 'audio';
      else media_type = 'document';

    } else if (media && media.photo) {
      media_type = 'photo';
      mime_type = 'image/jpeg';
      extension = '.jpg';
      filename = `photo_${msg.id}.jpg`;
      size = Number(media.photo.sizes ? media.photo.sizes[media.photo.sizes.length - 1]?.size || 0 : 0);
    } else {
      // Non-media message (text post, URL link)
      const hasUrl = /https?:\/\/[^\s]+/i.test(text_content);
      media_type = hasUrl ? 'link' : 'text';
      mime_type = 'text/plain';
      extension = '.txt';
      filename = `${this.generateTextTitle(text_content, msg.id)}.txt`;
      size = Buffer.byteLength(text_content, 'utf-8');
    }

    if (!filename) {
      extension = media_type === 'text' || media_type === 'link' ? '.txt' : this.getExtensionFromMime(mime_type);
      filename = `telegram_${media_type}_${msg.id}${extension}`;
    } else if (media_type !== 'text' && media_type !== 'link') {
      extension = path.extname(filename) || this.getExtensionFromMime(mime_type);
    }

    const isTextOrLink = media_type === 'text' || media_type === 'link';
    return { filename, extension, mime_type, size, media_type, text_content: isTextOrLink ? (text_content || undefined) : undefined };
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

  private getExtensionFromMime(mime: string): string {
    const map: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/x-matroska': '.mkv',
      'video/webm': '.webm',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/flac': '.flac',
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif'
    };
    return map[mime] || '.bin';
  }

  public async syncSession(sessionId: string): Promise<{ addedCount: number; message: string }> {
    const session = dbService.getSessionById(sessionId);
    if (!session) throw new Error('Session not found');

    const existingItems = dbService.getDownloadItems(sessionId);
    let maxMessageId = 0;
    let maxSeqNumber = 0;

    for (const item of existingItems) {
      if (item.message_id > maxMessageId) maxMessageId = item.message_id;
      if (item.sequence_number > maxSeqNumber) maxSeqNumber = item.sequence_number;
    }

    const newMessages = await telegramClient.fetchMessages(
      session.chat_id,
      maxMessageId > 0 ? maxMessageId : undefined,
      undefined,
      0
    );

    const validNewMessages = newMessages.filter((msg: any) => msg && msg.id && msg.id > maxMessageId);
    if (validNewMessages.length === 0) {
      return { addedCount: 0, message: `Channel "${session.title}" is up to date.` };
    }

    validNewMessages.sort((a: any, b: any) => a.id - b.id);

    const defaultBaseDir = session.destination_path;
    const tempDir = path.join(defaultBaseDir, '.temp');
    const padding = Math.max(session.sequence_padding || 3, String(maxSeqNumber + validNewMessages.length).length);
    const newItems: DownloadItem[] = [];

    validNewMessages.forEach((msg: any, index: number) => {
      const seqNumber = maxSeqNumber + index + 1;
      const formattedSeq = String(seqNumber).padStart(padding, '0');
      const mediaInfo = this.extractMediaDetails(msg);

      const tempFileName = `${sessionId}_${msg.id}.part`;
      const tempPath = path.join(tempDir, tempFileName);

      const finalFileName = `${formattedSeq}_${this.sanitizeFilename(mediaInfo.filename)}`;
      const finalPath = path.join(defaultBaseDir, finalFileName);

      newItems.push({
        id: `item_${sessionId}_${msg.id}`,
        session_id: sessionId,
        chat_id: session.chat_id,
        chat_title: session.chat_title,
        message_id: msg.id,
        sequence_number: seqNumber,
        formatted_sequence: formattedSeq,
        media_type: mediaInfo.media_type,
        original_filename: mediaInfo.filename,
        extension: mediaInfo.extension,
        mime_type: mediaInfo.mime_type,
        telegram_file_id: String(msg.id),
        total_bytes: mediaInfo.size,
        downloaded_bytes: 0,
        speed_bps: 0,
        status: 'QUEUED',
        temp_path: tempPath,
        final_path: finalPath,
        text_content: mediaInfo.text_content,
        created_at: new Date().toISOString()
      });
    });

    if (newItems.length > 0) {
      dbService.addDownloadItems(newItems);
      dbService.updateSessionProgress(sessionId);
      downloadManager.startQueue();
    }

    return {
      addedCount: newItems.length,
      message: `Synced ${newItems.length} new files for "${session.title}"`
    };
  }

  public async syncAllSessions(): Promise<{ totalAdded: number; message: string }> {
    const sessions = dbService.getSessions();
    let totalAdded = 0;

    for (const session of sessions) {
      try {
        const res = await this.syncSession(session.id);
        totalAdded += res.addedCount;
      } catch (err) {
        console.warn(`Sync failed for session ${session.id}:`, err);
      }
    }

    return {
      totalAdded,
      message: totalAdded > 0
        ? `Synced ${totalAdded} new files across channels.`
        : 'All channels are up to date.'
    };
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  private sanitizeFolderName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  }
}

export const scannerService = new ScannerService();

