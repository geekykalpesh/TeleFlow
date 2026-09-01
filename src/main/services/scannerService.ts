import { telegramClient } from './telegramClient';
import { dbService } from './dbService';
import { DownloadItem, DownloadSession, ScanOptions, MediaType } from '../../types';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { downloadManager } from './downloadManager';
import { parseTelegramLink } from '../utils/telegramLink';


export class ScannerService {

  public async scanAndEnqueue(options: ScanOptions): Promise<DownloadSession> {
    const {
      chat_id,
      chat_title,
      topic_id,
      topic_title,
      from_message_id,
      to_message_id,
      media_types,
      session_title = topic_title ? `${chat_title} - ${topic_title}` : `Session - ${chat_title}`,
      destination_path,
      download_mode = 'sequential',
      concurrency = 1
    } = options;

    const parsedFrom = parseTelegramLink(from_message_id);
    const parsedTo = parseTelegramLink(to_message_id);

    const effectiveFromId = parsedFrom.messageId ?? (typeof from_message_id === 'number' ? from_message_id : (from_message_id ? parseInt(String(from_message_id), 10) : undefined));
    const effectiveToId = parsedTo.messageId ?? (typeof to_message_id === 'number' ? to_message_id : (to_message_id ? parseInt(String(to_message_id), 10) : undefined));
    const effectiveChatId = parsedFrom.chatId || parsedTo.chatId || chat_id;

    let messages: any[] = [];

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
      // Fetch ALL messages in channel / range / topic (replyTo = topic_id)
      messages = await telegramClient.fetchMessages(effectiveChatId, effectiveFromId, effectiveToId, 0, topic_id);
    }

    const deletedTombstones = dbService.getDeletedTombstones();
    const validMessages = messages.filter((msg: any) => msg && msg.id && !deletedTombstones.has(msg.id));

    validMessages.sort((a: any, b: any) => a.id - b.id);

    const settingsDefault = dbService.getSetting('default_destination', '');
    const baseDownloadsDir = destination_path || settingsDefault || path.join(app ? app.getPath('downloads') : process.cwd(), 'TeleFlow');

    // Fetch forum topics for this chat to build a topic map
    let forumTopics: any[] = [];
    const topicMap = new Map<number, string>();
    try {
      forumTopics = await telegramClient.getForumTopics(effectiveChatId);
      if (forumTopics && forumTopics.length > 0) {
        forumTopics.forEach(t => topicMap.set(t.id, t.title));
      }
    } catch (e) {}

    const isForumGroup = topicMap.size > 0;
    const topicSeqCounters = new Map<string, number>();

    const sessionId = `session_${Date.now()}_${topic_id || 'main'}`;
    const downloadItems: DownloadItem[] = [];

    const selectedSet = options.selected_message_ids && options.selected_message_ids.length > 0
      ? new Set(options.selected_message_ids)
      : null;
    const filteredMessages = selectedSet
      ? validMessages.filter((msg: any) => selectedSet.has(msg.id))
      : validMessages;

    filteredMessages.forEach((msg: any) => {
      const mediaInfo = this.extractMediaDetails(msg);

      if (media_types && media_types.length > 0 && !media_types.includes(mediaInfo.media_type)) {
        return;
      }

      // File Size Filter
      if (options.min_file_size_mb !== undefined && options.min_file_size_mb > 0) {
        const minBytes = options.min_file_size_mb * 1024 * 1024;
        if (mediaInfo.size < minBytes) return;
      }
      if (options.max_file_size_mb !== undefined && options.max_file_size_mb > 0) {
        const maxBytes = options.max_file_size_mb * 1024 * 1024;
        if (mediaInfo.size > maxBytes) return;
      }

      // Keyword / Caption Filter
      const searchText = `${mediaInfo.filename} ${mediaInfo.text_content || ''} ${msg.message || ''}`.toLowerCase();

      if (options.include_keywords && options.include_keywords.trim().length > 0) {
        const includes = options.include_keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (includes.length > 0) {
          const matched = includes.some(k => searchText.includes(k));
          if (!matched) return;
        }
      }

      if (options.exclude_keywords && options.exclude_keywords.trim().length > 0) {
        const excludes = options.exclude_keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (excludes.length > 0) {
          const hasExcluded = excludes.some(k => searchText.includes(k));
          if (hasExcluded) return;
        }
      }

      // Determine topic ID and title for this specific message
      const replyToObj = msg.replyTo;
      const msgTopicId = replyToObj?.replyToTopId || replyToObj?.replyToMsgId || topic_id;
      let msgTopicTitle = topic_title;

      if (!msgTopicTitle && msgTopicId && topicMap.has(msgTopicId)) {
        msgTopicTitle = topicMap.get(msgTopicId);
      } else if (!msgTopicTitle && isForumGroup) {
        msgTopicTitle = 'General';
      }

      // Compute topic subfolder destination path
      const itemFolder = msgTopicTitle
        ? path.join(baseDownloadsDir, this.sanitizeFolderName(chat_title), this.sanitizeFolderName(msgTopicTitle))
        : path.join(baseDownloadsDir, this.sanitizeFolderName(chat_title));

      const topicKey = msgTopicTitle || 'main';
      const seqNumber = (topicSeqCounters.get(topicKey) || 0) + 1;
      topicSeqCounters.set(topicKey, seqNumber);

      const formattedSeq = String(seqNumber).padStart(3, '0');
      const tempPath = path.join(itemFolder, '.temp', `${sessionId}_${msg.id}.part`);
      const finalFileName = `${formattedSeq}_${this.sanitizeFilename(mediaInfo.filename)}`;
      const finalPath = path.join(itemFolder, finalFileName);

      // Skip Existing Files on Disk
      if (options.skip_existing_files) {
        if (fs.existsSync(finalPath) || fs.existsSync(tempPath)) {
          return;
        }
      }

      downloadItems.push({
        id: `item_${sessionId}_${msg.id}`,
        session_id: sessionId,
        chat_id: effectiveChatId,
        chat_title: chat_title,
        topic_id: msgTopicId,
        topic_title: msgTopicTitle,
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
      chat_id: effectiveChatId,
      chat_title,
      is_forum: !!topic_id,
      topic_id: topic_id,
      topic_title: topic_title,
      from_message_id,
      to_message_id,
      destination_path: path.join(baseDownloadsDir, this.sanitizeFolderName(chat_title)),
      add_sequence_prefix: true,
      sequence_padding: 3,
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
    downloadManager.startQueue();

    return session;
  }

  public async scanAndEnqueueAllTopics(options: ScanOptions): Promise<DownloadSession[]> {
    const topics = await telegramClient.getForumTopics(options.chat_id);
    if (!topics || topics.length === 0) {
      const session = await this.scanAndEnqueue(options);
      return [session];
    }

    const sessions: DownloadSession[] = [];
    for (const topic of topics) {
      try {
        const topicSession = await this.scanAndEnqueue({
          ...options,
          topic_id: topic.id,
          topic_title: topic.title,
          session_title: `${options.chat_title} - ${topic.title}`
        });
        sessions.push(topicSession);
      } catch (err) {
        console.warn(`[ScannerService] Failed to scan topic "${topic.title}":`, err);
      }
    }

    return sessions;
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
    } else {
      filename = this.sanitizeFilename(filename);
      if (media_type !== 'text' && media_type !== 'link') {
        extension = path.extname(filename) || this.getExtensionFromMime(mime_type);
      }
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
    const deletedTombstones = dbService.getDeletedTombstones(sessionId);
    const existingMsgIds = new Set(existingItems.map(i => i.message_id));

    let maxMessageId = 0;
    let maxSeqNumber = 0;

    for (const item of existingItems) {
      if (item.message_id > maxMessageId) maxMessageId = item.message_id;
      if (item.sequence_number > maxSeqNumber) maxSeqNumber = item.sequence_number;
    }
    for (const tId of deletedTombstones) {
      if (tId > maxMessageId) maxMessageId = tId;
    }

    const newMessages = await telegramClient.fetchMessages(
      session.chat_id,
      maxMessageId > 0 ? maxMessageId : undefined,
      undefined,
      0
    );

    const validNewMessages = newMessages.filter((msg: any) => msg && msg.id && msg.id > maxMessageId && !existingMsgIds.has(msg.id) && !deletedTombstones.has(msg.id));
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
    const sessions = dbService.getSessions().filter(s => s.sync_enabled !== false);
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
        : 'All active channels are up to date.'
    };
  }

  private sanitizeFilename(name: string): string {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    const cleanBase = base.replace(/[\\/:*?"<>|\r\n\t»«|]/g, '_').trim().replace(/\.+$/, '');
    const truncatedBase = cleanBase.substring(0, 80).trim().replace(/\.+$/, '');
    return `${truncatedBase}${ext || '.bin'}`;
  }

  private sanitizeFolderName(name: string): string {
    const clean = name.replace(/[\\/:*?"<>|\r\n\t»«|]/g, '_').trim().replace(/\.+$/, '');
    return clean.substring(0, 60).trim().replace(/\.+$/, '');
  }
}

export const scannerService = new ScannerService();

