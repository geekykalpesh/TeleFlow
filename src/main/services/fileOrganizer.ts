import fs from 'fs';
import path from 'path';
import { dbService } from './dbService';
import { DownloadItem } from '../../types';

export class FileOrganizer {
  public sanitizeFilename(name: string): string {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    const cleanBase = base.replace(/[\\/:*?"<>|\r\n\t»«|]/g, '_').trim().replace(/\.+$/, '');
    const truncatedBase = cleanBase.substring(0, 80).trim().replace(/\.+$/, '');
    return `${truncatedBase}${ext || '.bin'}`;
  }

  public sanitizePathFilename(filePath: string): string {
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const sanitized = this.sanitizeFilename(filename);
    return path.join(dir, sanitized);
  }

  private async safeMoveFile(src: string, dest: string, maxRetries: number = 10): Promise<void> {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxRetries) {
      try {
        fs.renameSync(src, dest);
        return;
      } catch (err: any) {
        attempt++;
        lastError = err;
        const code = err?.code || '';
        const errMsg = String(err?.message || err);

        // Cross-device link or cross-drive move
        if (code === 'EXDEV' || errMsg.includes('EXDEV')) {
          try {
            fs.copyFileSync(src, dest);
            try { fs.unlinkSync(src); } catch (e) {}
            return;
          } catch (copyErr) {
            lastError = copyErr;
          }
        }

        if (attempt >= maxRetries) {
          try {
            fs.copyFileSync(src, dest);
            try { fs.unlinkSync(src); } catch (e) {}
            return;
          } catch (copyErr) {
            throw lastError || err;
          }
        }

        // Asynchronously yield to the Node.js event loop (allowing OS file handles & Windows Defender locks to release)
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 200 * attempt)));
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
    await this.safeMoveFile(item.temp_path, targetPath);

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
          await this.safeMoveFile(item.final_path, newFinalPath);
          dbService.updateItemFinalPath(item.id, newFinalPath);
        }
      }
    }

    return updatedItems;
  }
}

export const fileOrganizer = new FileOrganizer();
