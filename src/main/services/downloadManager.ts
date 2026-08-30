import { dbService } from './dbService';
import { telegramClient } from './telegramClient';
import { fileOrganizer } from './fileOrganizer';
import { DownloadItem } from '../../types';
import { BrowserWindow, Notification, app } from 'electron';
import fs from 'fs';
import path from 'path';

export class DownloadManager {
  private activeDownloads: Map<string, { startTime: number; lastDownloaded: number }> = new Map();
  private activeTaskTokens: Map<string, string> = new Map();
  private activeTaskPromises: Map<string, Promise<void>> = new Map();
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private currentConcurrency: number = 5;
  private speedLimitBps: number = 0;
  private autoRetryTimer: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
    this.startAutoRetryLoop();
  }

  public setConcurrency(concurrency: number): void {
    this.currentConcurrency = Math.max(1, Math.min(16, concurrency));
  }

  public setSpeedLimit(bytesPerSec: number): void {
    this.speedLimitBps = Math.max(0, bytesPerSec);
    dbService.setSetting('max_speed_limit', String(this.speedLimitBps));
  }

  public getSpeedLimit(): number {
    if (this.speedLimitBps === 0) {
      const saved = dbService.getSetting('max_speed_limit', '0');
      this.speedLimitBps = parseInt(saved, 10) || 0;
    }
    return this.speedLimitBps;
  }

  public startAutoRetryLoop(): void {
    if (this.autoRetryTimer) return;
    this.autoRetryTimer = setInterval(() => {
      if (!this.isPaused) {
        const items = dbService.getDownloadItems();
        if (items.some(i => i.status === 'FAILED')) {
          console.log('[AutoRetry] Retrying failed items in background...');
          dbService.retryAllFailedItems();
          this.startQueue();
        }
      }
    }, 300000); // Check every 5 minutes
  }

  public startQueue(): void {
    this.isPaused = false;
    // Asynchronously dispatch queue processing off the IPC call stack
    setImmediate(() => {
      this.processQueue().catch((err) => console.error('[ProcessQueue Error]:', err));
    });
  }

  public pauseQueue(): void {
    this.pauseAll();
  }

  public pauseItem(id: string): void {
    // Signal the GramJS download to abort
    telegramClient.abortDownload(id);
    this.activeDownloads.delete(id);
    dbService.updateItemStatus(id, 'PAUSED');

    const item = dbService.getItemById(id);
    const downloaded = item ? item.downloaded_bytes : 0;
    const total = item ? item.total_bytes : 0;
    this.notifyProgress(id, 'PAUSED', downloaded, total, 0);
  }

  public resumeItem(id: string): void {
    telegramClient.clearAbortState(id);
    dbService.updateItemStatus(id, 'QUEUED');
    const item = dbService.getItemById(id);
    const downloaded = item ? item.downloaded_bytes : 0;
    const total = item ? item.total_bytes : 0;
    this.notifyProgress(id, 'QUEUED', downloaded, total, 0);
    this.startQueue();
  }

  public retryItem(id: string): void {
    telegramClient.clearAbortState(id);
    dbService.updateItemStatus(id, 'QUEUED');
    const item = dbService.getItemById(id);
    const total = item ? item.total_bytes : 0;
    this.notifyProgress(id, 'QUEUED', 0, total, 0);
    this.startQueue();
  }

  public pauseSession(sessionId: string): void {
    for (const [id] of this.activeDownloads) {
      const item = dbService.getItemById(id);
      if (item && item.session_id === sessionId) {
        telegramClient.abortDownload(id);
        this.activeDownloads.delete(id);
      }
    }
    dbService.pauseSessionItems(sessionId);
  }

  public resumeSession(sessionId: string): void {
    const items = dbService.getDownloadItems(sessionId);
    for (const item of items) {
      telegramClient.clearAbortState(item.id);
    }
    dbService.resumeSessionItems(sessionId);
    this.startQueue();
  }

  public retrySession(sessionId: string): void {
    const items = dbService.getDownloadItems(sessionId);
    for (const item of items) {
      telegramClient.clearAbortState(item.id);
    }
    dbService.retrySessionItems(sessionId);
    this.startQueue();
  }

  public pauseAll(): void {
    this.isPaused = true;
    for (const [id] of this.activeDownloads) {
      telegramClient.abortDownload(id);
    }
    this.activeDownloads.clear();
    dbService.pauseAllItems();
  }

  public resumeAll(): void {
    this.isPaused = false;
    telegramClient.clearAbortState();
    dbService.resumeAllItems();
    this.startQueue();
  }

  public pauseItems(ids: string[]): void {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      if (this.activeDownloads.has(id)) {
        telegramClient.abortDownload(id);
        this.activeDownloads.delete(id);
      }
    }
    dbService.pauseSelectedItems(ids);
  }

  public resumeItems(ids: string[]): void {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      telegramClient.clearAbortState(id);
    }
    dbService.resumeSelectedItems(ids);
    this.startQueue();
  }

  public prioritizeItems(ids: string[]): void {
    if (!ids || ids.length === 0) return;
    dbService.prioritizeSelectedItems(ids);
    this.startQueue();
  }

  public retryAllFailed(): void {
    telegramClient.clearAbortState();
    dbService.retryAllFailedItems();
    this.startQueue();
  }

  public async processQueue(): Promise<void> {
    if (this.isPaused) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const attemptedInThisPass = new Set<string>();

    while (this.activeDownloads.size < this.currentConcurrency && !this.isPaused) {
      const excludeIds = Array.from(new Set([...this.activeDownloads.keys(), ...attemptedInThisPass]));
      const nextItem = dbService.getNextQueuedItem(undefined, excludeIds);
      if (!nextItem) break;

      attemptedInThisPass.add(nextItem.id);
      this.downloadSingleItem(nextItem);
    }

    const remainingQueued = dbService.getNextQueuedItem();
    if (remainingQueued && this.activeDownloads.size < this.currentConcurrency && !this.isPaused) {
      setTimeout(() => this.processQueue(), 500);
    }

    if (this.activeDownloads.size === 0 && !remainingQueued) {
      this.isProcessing = false;
      this.checkAllComplete();
    }
  }

  private checkAllComplete(): void {
    if (this.isPaused) return;

    // Send system notification when entire queue is drained
    const items = dbService.getDownloadItems();
    const hasCompleted = items.some(i => i.status === 'COMPLETED');
    const hasUnfinished = items.some(i => i.status === 'QUEUED' || i.status === 'DOWNLOADING' || i.status === 'PAUSED');

    if (hasCompleted && !hasUnfinished) {
      this.sendSystemNotification(
        'TeleFlow — Downloads Complete',
        `All downloads finished. ${items.filter(i => i.status === 'COMPLETED').length} files saved.`
      );
    }
  }

  private sendSystemNotification(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title,
          body,
          icon: path.join(app.getAppPath(), 'public', 'icon.png')
        });
        notif.show();
      }
    } catch (e) {
      console.warn('System notification failed:', e);
    }
  }

  private async downloadSingleItem(item: DownloadItem): Promise<void> {
    // Check if item is paused before doing work
    const preItem = dbService.getItemById(item.id);
    if (preItem?.status === 'PAUSED') {
      console.log(`[Skip] Item #${item.sequence_number} is PAUSED. Skipping.`);
      return;
    }

    // Clear any stale abort flag for this item so download can proceed cleanly
    telegramClient.clearAbortState(item.id);

    // If a previous download task for this item is still aborting/cleaning up, wait for it to finish first
    if (this.activeTaskPromises.has(item.id)) {
      telegramClient.abortDownload(item.id);
      try {
        await this.activeTaskPromises.get(item.id);
      } catch (e) {}
    }

    const runToken = `${item.id}_${Date.now()}_${Math.random()}`;
    this.activeTaskTokens.set(item.id, runToken);
    this.activeDownloads.set(item.id, { startTime: Date.now(), lastDownloaded: 0 });

    // Instantly transition item status from QUEUED to DOWNLOADING in SQLite DB
    dbService.updateItemStatus(item.id, 'DOWNLOADING');
    this.notifyProgress(item.id, 'DOWNLOADING', item.downloaded_bytes || 0, item.total_bytes || 0, 0);

    const taskPromise = (async () => {
      if (item.media_type === 'text' || item.media_type === 'link') {
        try {
          const buffer = Buffer.from(item.text_content || '', 'utf-8');
          const finalDir = path.dirname(item.final_path);
          if (!fs.existsSync(finalDir)) {
            fs.mkdirSync(finalDir, { recursive: true });
          }
          fs.writeFileSync(item.final_path, buffer);
          console.log(`[TextSave] Saved #${item.sequence_number} text/link content to: ${item.final_path}`);
          dbService.updateItemProgress(item.id, buffer.length, buffer.length, 0, 'COMPLETED');
          this.notifyProgress(item.id, 'COMPLETED', buffer.length, buffer.length, 0, undefined, item.final_path);
        } catch (err: any) {
          console.error(`[TextSave Error] Item #${item.sequence_number}:`, err);
          dbService.updateItemProgress(item.id, 0, item.total_bytes, 0, 'FAILED', err.message || String(err));
          this.notifyProgress(item.id, 'FAILED', 0, item.total_bytes, 0, err.message || String(err));
        } finally {
          if (this.activeTaskTokens.get(item.id) === runToken) {
            this.activeDownloads.delete(item.id);
            this.activeTaskTokens.delete(item.id);
            this.activeTaskPromises.delete(item.id);
          }
          setTimeout(() => this.processQueue(), 100);
        }
        return;
      }

      const startTime = Date.now();

      // Resume: detect existing temp file size for byte offset
      let startOffset = 0;
      if (fs.existsSync(item.temp_path)) {
        try {
          const stat = fs.statSync(item.temp_path);
          // Align offset down to 4096-byte (4KB) boundary for Telegram MTProto API compatibility
          startOffset = Math.floor(stat.size / 4096) * 4096;
          console.log(`[Resume] Item #${item.sequence_number} (${item.original_filename}) has ${startOffset}/${item.total_bytes} bytes saved. Resuming from offset ${startOffset}...`);

          // If file already completed 100% on disk in temp folder, finalize immediately
          if (stat.size >= item.total_bytes && item.total_bytes > 0) {
            console.log(`[Resume Complete] Item #${item.sequence_number} is already 100% downloaded on disk. Finalizing...`);
            const finalLocation = await fileOrganizer.finalizeFile(item);
            dbService.updateItemProgress(item.id, item.total_bytes, item.total_bytes, 0, 'COMPLETED');
            this.notifyProgress(item.id, 'COMPLETED', item.total_bytes, item.total_bytes, 0, undefined, finalLocation);
            if (this.activeTaskTokens.get(item.id) === runToken) {
              this.activeDownloads.delete(item.id);
              this.activeTaskTokens.delete(item.id);
              this.activeTaskPromises.delete(item.id);
            }
            setTimeout(() => this.processQueue(), 100);
            return;
          }
        } catch (e) {
          startOffset = 0;
        }
      }

      dbService.updateItemProgress(item.id, startOffset, item.total_bytes, 0, 'DOWNLOADING');
      this.notifyProgress(item.id, 'DOWNLOADING', startOffset, item.total_bytes, 0);

      let lastTime = startTime;
      let lastBytes = startOffset;

      // Register AbortController for this item
      telegramClient.registerAbortController(item.id);

      try {
        await telegramClient.downloadFileChunk(
          item.chat_id,
          item.message_id,
          item.temp_path,
          (downloadedBytes, totalBytes) => {
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            let speedBps = 0;

            if (timeDiff >= 0.5) {
              const bytesDiff = downloadedBytes - lastBytes;
              speedBps = Math.max(0, Math.round(bytesDiff / timeDiff));
              lastTime = now;
              lastBytes = downloadedBytes;
            }

            dbService.updateItemProgress(item.id, downloadedBytes, totalBytes || item.total_bytes, speedBps, 'DOWNLOADING');
            this.notifyProgress(item.id, 'DOWNLOADING', downloadedBytes, totalBytes || item.total_bytes, speedBps);
          },
          item.id,
          startOffset
        );

        // Post-check: If aborted or paused while download completed, do not finalize
        const postItem = dbService.getItemById(item.id);
        if (postItem?.status === 'PAUSED' || telegramClient.isDownloadAborted(item.id)) {
          console.log(`[Paused] Item #${item.sequence_number} was paused during transfer.`);
          return;
        }

        // Download completed cleanly — move temp file to final destination
        const finalLocation = await fileOrganizer.finalizeFile(item);
        dbService.updateItemFinalPath(item.id, finalLocation);

        dbService.updateItemProgress(item.id, item.total_bytes, item.total_bytes, 0, 'COMPLETED');
        this.notifyProgress(item.id, 'COMPLETED', item.total_bytes, item.total_bytes, 0, undefined, finalLocation);

      } catch (err: any) {
        const errMsg = String(err.message || err);

        // If aborted by user pause, keep status as PAUSED unless already resumed to QUEUED
        if (errMsg.toLowerCase().includes('cancel') || errMsg.toLowerCase().includes('abort') || telegramClient.isDownloadAborted(item.id)) {
          console.log(`[Paused] Item #${item.sequence_number} download was cancelled by user.`);
          const dbCurr = dbService.getItemById(item.id);
          if (dbCurr?.status !== 'QUEUED') {
            const downloaded = dbCurr ? dbCurr.downloaded_bytes : startOffset;
            const total = dbCurr ? dbCurr.total_bytes : item.total_bytes;
            dbService.updateItemStatus(item.id, 'PAUSED');
            this.notifyProgress(item.id, 'PAUSED', downloaded, total, 0);
          }
        } else {
          console.error(`[Failed] Item #${item.sequence_number}:`, errMsg);

          // Preserve partial temp file on failure so resume can pick up from stat.size
          let preservedBytes = startOffset;
          if (fs.existsSync(item.temp_path)) {
            try {
              preservedBytes = fs.statSync(item.temp_path).size;
            } catch (e) {}
          }

          dbService.updateItemProgress(item.id, preservedBytes, item.total_bytes, 0, 'FAILED', errMsg);
          this.notifyProgress(item.id, 'FAILED', preservedBytes, item.total_bytes, 0, errMsg);
        }

      } finally {
        telegramClient.unregisterAbortController(item.id);
        if (this.activeTaskTokens.get(item.id) === runToken) {
          this.activeDownloads.delete(item.id);
          this.activeTaskTokens.delete(item.id);
          this.activeTaskPromises.delete(item.id);
        }
        // Give a short delay before processing next item
        setTimeout(() => this.processQueue(), 300);
      }
    })();

    this.activeTaskPromises.set(item.id, taskPromise);
    return taskPromise;
  }

  private cleanupTempFile(tempPath: string): void {
    try {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
        console.log(`[Cleanup] Deleted failed temp file: ${tempPath}`);
      }
    } catch (e) {
      console.warn('[Cleanup] Could not delete temp file:', tempPath, e);
    }
  }

  private notifyProgress(
    id: string, status: string, downloaded: number, total: number,
    speed: number, error?: string, finalPath?: string
  ): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('download-progress', {
        id, status,
        downloaded_bytes: downloaded,
        total_bytes: total,
        speed_bps: speed,
        error_message: error,
        final_path: finalPath
      });
    }
  }
}

export const downloadManager = new DownloadManager();
