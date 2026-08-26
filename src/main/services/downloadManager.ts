import { dbService } from './dbService';
import { telegramClient } from './telegramClient';
import { fileOrganizer } from './fileOrganizer';
import { DownloadItem } from '../../types';
import { BrowserWindow, Notification, app } from 'electron';
import fs from 'fs';
import path from 'path';

export class DownloadManager {
  private activeDownloads: Map<string, { startTime: number; lastDownloaded: number }> = new Map();
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private currentConcurrency: number = 5;
  private mainWindow: BrowserWindow | null = null;

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  public setConcurrency(concurrency: number): void {
    this.currentConcurrency = Math.max(1, Math.min(16, concurrency));
  }

  public startQueue(): void {
    this.isPaused = false;
    // Always trigger processQueue regardless of isProcessing guard
    this.processQueue();
  }

  public pauseQueue(): void {
    this.isPaused = true;
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
    dbService.updateItemStatus(id, 'QUEUED');
    const item = dbService.getItemById(id);
    const downloaded = item ? item.downloaded_bytes : 0;
    const total = item ? item.total_bytes : 0;
    this.notifyProgress(id, 'QUEUED', downloaded, total, 0);
    this.startQueue();
  }

  public retryItem(id: string): void {
    dbService.updateItemStatus(id, 'QUEUED');
    const item = dbService.getItemById(id);
    const total = item ? item.total_bytes : 0;
    this.notifyProgress(id, 'QUEUED', 0, total, 0);
    this.startQueue();
  }

  public retryAllFailed(): void {
    dbService.retryAllFailedItems();
    this.startQueue();
  }

  public async processQueue(): Promise<void> {
    if (this.isPaused) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    while (this.activeDownloads.size < this.currentConcurrency && !this.isPaused) {
      const nextItem = dbService.getNextQueuedItem();
      if (!nextItem) break;
      this.downloadSingleItem(nextItem);
    }

    if (this.activeDownloads.size === 0 && !dbService.getNextQueuedItem()) {
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
    // Check if item is paused or aborted before doing work
    const preItem = dbService.getItemById(item.id);
    if (preItem?.status === 'PAUSED' || telegramClient.isDownloadAborted(item.id)) {
      console.log(`[Skip] Item #${item.sequence_number} is PAUSED. Skipping.`);
      return;
    }

    const startTime = Date.now();
    this.activeDownloads.set(item.id, { startTime, lastDownloaded: 0 });

    // Resume: detect existing temp file size for byte offset
    let startOffset = 0;
    if (fs.existsSync(item.temp_path)) {
      try {
        const stat = fs.statSync(item.temp_path);
        startOffset = stat.size;
        console.log(`[Resume] Item #${item.sequence_number} has ${startOffset} bytes already. Resuming...`);
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

      dbService.updateItemProgress(item.id, item.total_bytes, item.total_bytes, 0, 'COMPLETED');
      this.notifyProgress(item.id, 'COMPLETED', item.total_bytes, item.total_bytes, 0, undefined, finalLocation);

    } catch (err: any) {
      const errMsg = String(err.message || err);

      // If aborted by user pause, keep status as PAUSED
      if (errMsg.toLowerCase().includes('cancel') || errMsg.toLowerCase().includes('abort') || telegramClient.isDownloadAborted(item.id)) {
        console.log(`[Paused] Item #${item.sequence_number} download was cancelled by user.`);
        const dbCurr = dbService.getItemById(item.id);
        const downloaded = dbCurr ? dbCurr.downloaded_bytes : startOffset;
        const total = dbCurr ? dbCurr.total_bytes : item.total_bytes;
        dbService.updateItemStatus(item.id, 'PAUSED');
        this.notifyProgress(item.id, 'PAUSED', downloaded, total, 0);
      } else {
        console.error(`[Failed] Item #${item.sequence_number}:`, errMsg);

        // Clean up partial temp file on genuine failure
        this.cleanupTempFile(item.temp_path);

        dbService.updateItemProgress(item.id, 0, item.total_bytes, 0, 'FAILED', errMsg);
        this.notifyProgress(item.id, 'FAILED', 0, item.total_bytes, 0, errMsg);
      }

    } finally {
      telegramClient.unregisterAbortController(item.id);
      this.activeDownloads.delete(item.id);
      // Give a short delay before processing next item
      setTimeout(() => this.processQueue(), 300);
    }
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
