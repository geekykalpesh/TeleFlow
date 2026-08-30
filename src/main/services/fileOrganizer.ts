import fs from 'fs';
import path from 'path';
import { dbService } from './dbService';
import { DownloadItem } from '../../types';

export class FileOrganizer {
  public sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().replace(/\.+$/, '');
  }

  public sanitizePathFilename(filePath: string): string {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const sanitized = this.sanitizeFilename(filename);
    return path.join(dir, sanitized);
  }

  private safeMoveFile(src: string, dest: string, maxRetries: number = 5): void {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        fs.renameSync(src, dest);
        return;
      } catch (err: any) {
        attempt++;
        const code = err?.code || '';
        const errMsg = String(err?.message || err);

        if (code === 'EXDEV' || errMsg.includes('EXDEV')) {
          fs.copyFileSync(src, dest);
          try { fs.unlinkSync(src); } catch (e) {}
          return;
        }

        if (attempt >= maxRetries) {
          try {
            fs.copyFileSync(src, dest);
            try { fs.unlinkSync(src); } catch (e) {}
            return;
          } catch (copyErr) {
            throw err;
          }
        }

        // Wait 100ms for OS file lock on Windows to release before retry
        const deSync = Date.now() + 100;
        while (Date.now() < deSync) {}
      }
    }
  }

  public async finalizeFile(item: DownloadItem): Promise<string> {
    if (!fs.existsSync(item.temp_path)) {
      throw new Error(`Temporary file not found at ${item.temp_path}`);
    }

    // Ensure target path filename contains no illegal Windows characters (e.g. colons in timestamps)
    let targetPath = this.sanitizePathFilename(item.final_path);

    const finalDir = path.dirname(targetPath);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    // Handle collision if file already exists
    if (fs.existsSync(targetPath) && targetPath !== item.temp_path) {
      const ext = path.extname(targetPath);
      const base = targetPath.slice(0, targetPath.length - ext.length);
      targetPath = `${base}_${Date.now()}${ext}`;
    }

    // Safe move supporting cross-device / cross-drive locations and retrying OS file locks
    this.safeMoveFile(item.temp_path, targetPath);

    return targetPath;
  }

  public async renumberSessionFolder(sessionId: string): Promise<DownloadItem[]> {
    const updatedItems = dbService.renumberSessionItems(sessionId);

    // Rename files physically in destination directory to match new renumbered sequence numbers
    for (const item of updatedItems) {
      if (item.status === 'COMPLETED' && fs.existsSync(item.final_path)) {
        const dir = path.dirname(item.final_path);
        const originalBase = this.sanitizeFilename(item.original_filename);
        const newFinalPath = path.join(dir, `${item.formatted_sequence}_${originalBase}`);

        if (item.final_path !== newFinalPath && !fs.existsSync(newFinalPath)) {
          this.safeMoveFile(item.final_path, newFinalPath);
          dbService.updateItemFinalPath(item.id, newFinalPath);
        }
      }
    }

    return updatedItems;
  }
}

export const fileOrganizer = new FileOrganizer();
