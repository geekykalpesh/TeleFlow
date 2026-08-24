import fs from 'fs';
import path from 'path';
import { dbService } from './dbService';
import { DownloadItem } from '../../types';

export class FileOrganizer {
  public async finalizeFile(item: DownloadItem): Promise<string> {
    if (!fs.existsSync(item.temp_path)) {
      throw new Error(`Temporary file not found at ${item.temp_path}`);
    }

    const finalDir = path.dirname(item.final_path);
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    let targetPath = item.final_path;

    // Handle collision if file already exists
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(targetPath);
      const base = targetPath.slice(0, targetPath.length - ext.length);
      targetPath = `${base}_${Date.now()}${ext}`;
    }

    // Atomic move from .temp to final path
    fs.renameSync(item.temp_path, targetPath);

    return targetPath;
  }

  public async renumberSessionFolder(sessionId: string): Promise<DownloadItem[]> {
    const updatedItems = dbService.renumberSessionItems(sessionId);

    // Rename files physically in destination directory to match new renumbered sequence numbers
    for (const item of updatedItems) {
      if (item.status === 'COMPLETED' && fs.existsSync(item.final_path)) {
        const dir = path.dirname(item.final_path);
        const originalBase = item.original_filename;
        const newFinalPath = path.join(dir, `${item.formatted_sequence}_${originalBase}`);

        if (item.final_path !== newFinalPath && !fs.existsSync(newFinalPath)) {
          fs.renameSync(item.final_path, newFinalPath);
          dbService.updateItemProgress(item.id, item.downloaded_bytes, item.total_bytes, 0, 'COMPLETED');
        }
      }
    }

    return updatedItems;
  }
}

export const fileOrganizer = new FileOrganizer();
