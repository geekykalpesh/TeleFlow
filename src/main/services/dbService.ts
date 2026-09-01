import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DownloadItem, DownloadSession, AppSettings } from '../../types';

class DbService {
  private db: Database | null = null;
  private dbPath: string = '';

  public async init(): Promise<void> {
    const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), '.teleflow_data');
    const dbFolder = path.join(userDataPath, 'database');
    if (!fs.existsSync(dbFolder)) {
      fs.mkdirSync(dbFolder, { recursive: true });
    }
    this.dbPath = path.join(dbFolder, 'downloads.db');

    const candidateWasmPaths = [
      path.join(__dirname, 'sql-wasm.wasm'),
      path.join(__dirname, '../dist-electron/sql-wasm.wasm'),
      path.join(app ? app.getAppPath() : process.cwd(), 'dist-electron', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    ];

    let wasmPath = '';
    for (const p of candidateWasmPaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    let SQL: any;
    if (wasmPath) {
      const wasmBuffer = fs.readFileSync(wasmPath);
      const wasmBinary = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
      SQL = await initSqlJs({ wasmBinary });
    } else {
      SQL = await initSqlJs();
    }

    if (fs.existsSync(this.dbPath)) {
      const filebuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(filebuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
    this.repairDuplicateSequenceNumbers();
    this.repairCorruptedItemPaths();
    this.save();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_title TEXT NOT NULL,
        from_message_id INTEGER,
        to_message_id INTEGER,
        destination_path TEXT NOT NULL,
        add_sequence_prefix INTEGER NOT NULL DEFAULT 1,
        sequence_padding INTEGER NOT NULL DEFAULT 3,
        download_mode TEXT NOT NULL DEFAULT 'sequential',
        concurrency INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        download_enabled INTEGER NOT NULL DEFAULT 1,
        sync_enabled INTEGER NOT NULL DEFAULT 1
      );
    `);

    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN download_enabled INTEGER NOT NULL DEFAULT 1`);
    } catch (e) {}

    try {
      this.db.run(`ALTER TABLE sessions ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1`);
    } catch (e) {}

    this.db.run(`
      CREATE TABLE IF NOT EXISTS download_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_title TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        sequence_number INTEGER NOT NULL,
        formatted_sequence TEXT NOT NULL,
        media_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        extension TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        telegram_file_id TEXT,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        speed_bps INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        temp_path TEXT NOT NULL,
        final_path TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        text_content TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    // Safe migration check for existing DBs created before text_content column
    try {
      this.db.run(`ALTER TABLE download_items ADD COLUMN text_content TEXT`);
    } catch (e) {
      // Column already exists
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Tombstones table to permanently prevent deleted items from reappearing during scan/sync
    this.db.run(`
      CREATE TABLE IF NOT EXISTS deleted_tombstones (
        session_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        PRIMARY KEY(session_id, message_id)
      );
    `);

    // Enterprise scale indexes for ultra-fast query performance
    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_items_session_seq ON download_items(session_id, sequence_number);`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_items_status_seq ON download_items(status, sequence_number);`);
    } catch (e) {}

    // Reset DOWNLOADING items back to QUEUED on startup to handle crash recovery cleanly
    this.db.run(`UPDATE download_items SET status = 'QUEUED' WHERE status = 'DOWNLOADING'`);

    // Clean up text_content on binary media items (video, photo, document, audio, voice)
    try {
      this.db.run(`UPDATE download_items SET text_content = NULL WHERE media_type NOT IN ('text', 'link')`);
    } catch (e) {
      console.warn('[DbService] Media cleanup warning:', e);
    }

    this.save();
  }

  private saveTimeout: NodeJS.Timeout | null = null;

  public saveDebounced(delayMs: number = 2000): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.save();
    }, delayMs);
  }

  public save(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (!this.db || !this.dbPath) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('Failed to persist SQLite DB:', err);
    }
  }

  // Sessions CRUD
  public createSession(session: DownloadSession): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, title, chat_id, chat_title, from_message_id, to_message_id,
        destination_path, add_sequence_prefix, sequence_padding,
        download_mode, concurrency, created_at, status, download_enabled, sync_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      session.id, session.title, session.chat_id, session.chat_title,
      session.from_message_id || null, session.to_message_id || null,
      session.destination_path, session.add_sequence_prefix ? 1 : 0,
      session.sequence_padding, session.download_mode, session.concurrency,
      session.created_at, session.status,
      session.download_enabled === false ? 0 : 1,
      session.sync_enabled === false ? 0 : 1
    ]);
    stmt.free();
    this.save();
  }

  public getSessions(): DownloadSession[] {
    if (!this.db) return [];
    const res = this.db.exec(`SELECT id, title, chat_id, chat_title, from_message_id, to_message_id, destination_path, add_sequence_prefix, sequence_padding, download_mode, concurrency, created_at, status, download_enabled, sync_enabled FROM sessions ORDER BY created_at DESC`);
    if (!res.length) return [];
    
    const rows = res[0].values;
    return rows.map((row: any[]) => {
      const sessionId = row[0] as string;
      const stats = this.getSessionStats(sessionId);
      return {
        id: row[0],
        title: row[1],
        chat_id: row[2],
        chat_title: row[3],
        from_message_id: row[4],
        to_message_id: row[5],
        destination_path: row[6],
        add_sequence_prefix: Boolean(row[7]),
        sequence_padding: row[8],
        download_mode: row[9],
        concurrency: row[10],
        created_at: row[11],
        status: row[12],
        download_enabled: row[13] === undefined || row[13] === null ? true : Boolean(row[13]),
        sync_enabled: row[14] === undefined || row[14] === null ? true : Boolean(row[14]),
        total_files: stats.total_files,
        completed_files: stats.completed_files,
        total_bytes: stats.total_bytes,
        downloaded_bytes: stats.downloaded_bytes
      };
    });
  }

  public getSessionById(sessionId: string): DownloadSession | null {
    if (!this.db) return null;
    const cleanId = sessionId.replace(/'/g, "''");
    const res = this.db.exec(`SELECT id, title, chat_id, chat_title, from_message_id, to_message_id, destination_path, add_sequence_prefix, sequence_padding, download_mode, concurrency, created_at, status, download_enabled, sync_enabled FROM sessions WHERE id = '${cleanId}'`);
    if (!res.length || !res[0].values.length) return null;
    const row = res[0].values[0];
    const stats = this.getSessionStats(sessionId);
    return {
      id: row[0] as string,
      title: row[1] as string,
      chat_id: row[2] as string,
      chat_title: row[3] as string,
      from_message_id: row[4] as number,
      to_message_id: row[5] as number,
      destination_path: row[6] as string,
      add_sequence_prefix: Boolean(row[7]),
      sequence_padding: row[8] as number,
      download_mode: row[9] as any,
      concurrency: row[10] as number,
      created_at: row[11] as string,
      status: row[12] as any,
      download_enabled: row[13] === undefined || row[13] === null ? true : Boolean(row[13]),
      sync_enabled: row[14] === undefined || row[14] === null ? true : Boolean(row[14]),
      total_files: stats.total_files,
      completed_files: stats.completed_files,
      total_bytes: stats.total_bytes,
      downloaded_bytes: stats.downloaded_bytes
    };
  }


  private getSessionStats(sessionId: string) {
    if (!this.db) return { total_files: 0, completed_files: 0, total_bytes: 0, downloaded_bytes: 0 };
    const res = this.db.exec(`
      SELECT 
        COUNT(*),
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END),
        SUM(total_bytes),
        SUM(downloaded_bytes)
      FROM download_items WHERE session_id = '${sessionId}'
    `);
    if (!res.length || !res[0].values.length) return { total_files: 0, completed_files: 0, total_bytes: 0, downloaded_bytes: 0 };
    const r = res[0].values[0];
    return {
      total_files: (r[0] as number) || 0,
      completed_files: (r[1] as number) || 0,
      total_bytes: (r[2] as number) || 0,
      downloaded_bytes: (r[3] as number) || 0
    };
  }

  // Items CRUD
  public addDownloadItems(items: DownloadItem[]): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO download_items (
        id, session_id, chat_id, chat_title, message_id, sequence_number,
        formatted_sequence, media_type, original_filename, extension, mime_type,
        telegram_file_id, total_bytes, downloaded_bytes, speed_bps, status,
        temp_path, final_path, error_message, created_at, completed_at, text_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      stmt.run([
        item.id, item.session_id, item.chat_id, item.chat_title, item.message_id,
        item.sequence_number, item.formatted_sequence, item.media_type,
        item.original_filename, item.extension, item.mime_type,
        item.telegram_file_id || null, item.total_bytes, item.downloaded_bytes,
        item.speed_bps, item.status, item.temp_path, item.final_path,
        item.error_message || null, item.created_at, item.completed_at || null,
        item.text_content || null
      ]);
    }
    stmt.free();
    this.save();
  }

  public getDownloadItems(sessionId?: string): DownloadItem[] {
    if (!this.db) return [];
    let query = `SELECT id, session_id, chat_id, chat_title, message_id, sequence_number, formatted_sequence, media_type, original_filename, extension, mime_type, telegram_file_id, total_bytes, downloaded_bytes, speed_bps, status, temp_path, final_path, error_message, created_at, completed_at, text_content FROM download_items`;
    if (sessionId) {
      query += ` WHERE session_id = '${sessionId}'`;
    }
    query += ` ORDER BY sequence_number ASC`;

    const res = this.db.exec(query);
    if (!res.length) return [];

    return res[0].values.map((row: any[]) => ({
      id: row[0],
      session_id: row[1],
      chat_id: row[2],
      chat_title: row[3],
      message_id: row[4],
      sequence_number: row[5],
      formatted_sequence: row[6],
      media_type: row[7],
      original_filename: row[8],
      extension: row[9],
      mime_type: row[10],
      telegram_file_id: row[11],
      total_bytes: row[12],
      downloaded_bytes: row[13],
      speed_bps: row[14],
      status: row[15],
      temp_path: row[16],
      final_path: row[17],
      error_message: row[18],
      created_at: row[19],
      completed_at: row[20],
      text_content: row[21] || undefined
    }));
  }

  public getItemById(id: string): DownloadItem | null {
    if (!this.db) return null;
    const res = this.db.exec(`SELECT id, session_id, chat_id, chat_title, message_id, sequence_number, formatted_sequence, media_type, original_filename, extension, mime_type, telegram_file_id, total_bytes, downloaded_bytes, speed_bps, status, temp_path, final_path, error_message, created_at, completed_at, text_content FROM download_items WHERE id = '${id}'`);
    if (!res.length || !res[0].values.length) return null;
    const row = res[0].values[0];
    return {
      id: row[0] as string,
      session_id: row[1] as string,
      chat_id: row[2] as string,
      chat_title: row[3] as string,
      message_id: row[4] as number,
      sequence_number: row[5] as number,
      formatted_sequence: row[6] as string,
      media_type: row[7] as any,
      original_filename: row[8] as string,
      extension: row[9] as string,
      mime_type: row[10] as string,
      telegram_file_id: row[11] as string,
      total_bytes: row[12] as number,
      downloaded_bytes: row[13] as number,
      speed_bps: row[14] as number,
      status: row[15] as any,
      temp_path: row[16] as string,
      final_path: row[17] as string,
      error_message: row[18] as string,
      created_at: row[19] as string,
      completed_at: row[20] as string,
      text_content: (row[21] as string) || undefined
    };
  }

  public getNextQueuedItem(sessionId?: string, excludeIds: string[] = []): DownloadItem | null {
    if (!this.db) return null;
    let query = `SELECT i.id, i.session_id, i.chat_id, i.chat_title, i.message_id, i.sequence_number, i.formatted_sequence, i.media_type, i.original_filename, i.extension, i.mime_type, i.telegram_file_id, i.total_bytes, i.downloaded_bytes, i.speed_bps, i.status, i.temp_path, i.final_path, i.error_message, i.created_at, i.completed_at, i.text_content FROM download_items i LEFT JOIN sessions s ON i.session_id = s.id WHERE i.status = 'QUEUED' AND (s.download_enabled IS NULL OR s.download_enabled = 1)`;
    if (sessionId) {
      query += ` AND i.session_id = '${sessionId.replace(/'/g, "''")}'`;
    }
    if (excludeIds && excludeIds.length > 0) {
      const formatted = excludeIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
      query += ` AND i.id NOT IN (${formatted})`;
    }
    query += ` ORDER BY i.sequence_number ASC LIMIT 1`;

    const res = this.db.exec(query);
    if (!res.length || !res[0].values.length) return null;
    const row = res[0].values[0];

    return {
      id: row[0] as string,
      session_id: row[1] as string,
      chat_id: row[2] as string,
      chat_title: row[3] as string,
      message_id: row[4] as number,
      sequence_number: row[5] as number,
      formatted_sequence: row[6] as string,
      media_type: row[7] as any,
      original_filename: row[8] as string,
      extension: row[9] as string,
      mime_type: row[10] as string,
      telegram_file_id: row[11] as string,
      total_bytes: row[12] as number,
      downloaded_bytes: row[13] as number,
      speed_bps: row[14] as number,
      status: row[15] as any,
      temp_path: row[16] as string,
      final_path: row[17] as string,
      error_message: row[18] as string,
      created_at: row[19] as string,
      completed_at: row[20] as string,
      text_content: (row[21] as string) || undefined
    };
  }

  public updateItemStatus(id: string, status: string): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = '${status}', speed_bps = 0 WHERE id = '${id}'`);
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'PAUSED') {
      this.save();
    } else {
      this.saveDebounced(1500);
    }
  }

  public updateItemProgress(id: string, downloadedBytes: number, totalBytes: number, speedBps: number, status: string, error?: string): void {
    if (!this.db) return;
    let completedAt = null;
    if (status === 'COMPLETED') {
      completedAt = new Date().toISOString();
    }
    const stmt = this.db.prepare(`
      UPDATE download_items
      SET downloaded_bytes = ?, total_bytes = ?, speed_bps = ?, status = ?, error_message = ?, completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `);
    stmt.run([downloadedBytes, totalBytes, speedBps, status, error || null, completedAt, id]);
    stmt.free();

    if (status === 'COMPLETED' || status === 'FAILED') {
      this.save();
    } else {
      this.saveDebounced(2000);
    }
  }

  // Batch Operations
  public pauseSessionItems(sessionId: string): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'PAUSED', speed_bps = 0 WHERE session_id = '${sessionId}' AND status IN ('QUEUED', 'DOWNLOADING')`);
    this.save();
  }

  public resumeSessionItems(sessionId: string): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'QUEUED', speed_bps = 0 WHERE session_id = '${sessionId}' AND status IN ('PAUSED', 'FAILED')`);
    this.save();
  }

  public retrySessionItems(sessionId: string): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'QUEUED', speed_bps = 0, error_message = NULL WHERE session_id = '${sessionId}' AND status IN ('FAILED', 'PAUSED')`);
    this.save();
  }

  public pauseAllItems(): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'PAUSED', speed_bps = 0 WHERE status IN ('QUEUED', 'DOWNLOADING')`);
    this.save();
  }

  public resumeAllItems(): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'QUEUED', speed_bps = 0 WHERE status IN ('PAUSED', 'FAILED')`);
    this.save();
  }

  // Selective Multi-Item Controls
  public pauseSelectedItems(ids: string[]): void {
    if (!this.db || !ids || ids.length === 0) return;
    const formattedIds = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    this.db.run(`UPDATE download_items SET status = 'PAUSED', speed_bps = 0 WHERE id IN (${formattedIds}) AND status IN ('QUEUED', 'DOWNLOADING')`);
    this.save();
  }

  public resumeSelectedItems(ids: string[]): void {
    if (!this.db || !ids || ids.length === 0) return;
    const formattedIds = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    this.db.run(`UPDATE download_items SET status = 'QUEUED', speed_bps = 0 WHERE id IN (${formattedIds}) AND status IN ('PAUSED', 'FAILED')`);
    this.save();
  }

  public prioritizeSelectedItems(ids: string[]): void {
    if (!this.db || !ids || ids.length === 0) return;
    const formattedIds = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    this.db.run(`UPDATE download_items SET status = 'QUEUED' WHERE id IN (${formattedIds})`);
    this.save();
  }

  public deleteSession(sessionId: string, deleteFilesOnDisk: boolean = false): void {
    if (!this.db) return;
    const cleanSessionId = sessionId.replace(/'/g, "''");

    if (deleteFilesOnDisk) {
      const items = this.getDownloadItems(sessionId);
      for (const item of items) {
        if (item.temp_path && fs.existsSync(item.temp_path)) {
          try { fs.rmSync(item.temp_path, { force: true }); } catch (e) {}
        }
        if (item.final_path && fs.existsSync(item.final_path)) {
          try { fs.rmSync(item.final_path, { force: true }); } catch (e) {}
        }
      }
    }

    this.db.run(`DELETE FROM download_items WHERE session_id = '${cleanSessionId}'`);
    this.db.run(`DELETE FROM sessions WHERE id = '${cleanSessionId}'`);
    this.save();
  }

  public updateSessionFlags(sessionId: string, flags: { download_enabled?: boolean; sync_enabled?: boolean }): void {
    if (!this.db) return;
    const cleanSessionId = sessionId.replace(/'/g, "''");
    const updates: string[] = [];
    if (flags.download_enabled !== undefined) {
      updates.push(`download_enabled = ${flags.download_enabled ? 1 : 0}`);
    }
    if (flags.sync_enabled !== undefined) {
      updates.push(`sync_enabled = ${flags.sync_enabled ? 1 : 0}`);
    }
    if (updates.length > 0) {
      this.db.run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = '${cleanSessionId}'`);
      this.save();
    }
  }

  public deleteDownloadItems(ids: string[]): void {
    if (!this.db || !ids || ids.length === 0) return;
    try {
      const formattedIds = ids.map(id => `'${id}'`).join(',');
      
      // Store session_id and message_id in deleted_tombstones table before deletion
      const itemRes = this.db.exec(`SELECT session_id, message_id FROM download_items WHERE id IN (${formattedIds})`);
      if (itemRes.length && itemRes[0].values) {
        for (const row of itemRes[0].values) {
          const sid = String(row[0]);
          const mid = Number(row[1]);
          if (sid && mid) {
            this.db.run(`INSERT OR IGNORE INTO deleted_tombstones (session_id, message_id) VALUES ('${sid}', ${mid})`);
          }
        }
      }

      const sessionRes = this.db.exec(`SELECT DISTINCT session_id FROM download_items WHERE id IN (${formattedIds})`);
      const sessionIds: string[] = sessionRes.length && sessionRes[0].values ? sessionRes[0].values.map((r: any) => String(r[0])) : [];

      this.db.run(`DELETE FROM download_items WHERE id IN (${formattedIds})`);

      sessionIds.forEach(sid => this.updateSessionProgress(sid));
      this.save();
    } catch (err) {
      console.error('[DbService] deleteDownloadItems error:', err);
    }
  }

  public getDeletedTombstones(sessionId?: string): Set<number> {
    if (!this.db) return new Set();
    let query = `SELECT message_id FROM deleted_tombstones`;
    if (sessionId) {
      query += ` WHERE session_id = '${sessionId}'`;
    }
    const res = this.db.exec(query);
    if (!res.length || !res[0].values) return new Set();
    return new Set(res[0].values.map((r: any) => Number(r[0])));
  }

  public clearCompletedItems(sessionId?: string): void {
    if (!this.db) return;
    try {
      let query = `SELECT id FROM download_items WHERE status = 'COMPLETED'`;
      if (sessionId) {
        query += ` AND session_id = '${sessionId}'`;
      }
      const res = this.db.exec(query);
      if (!res.length || !res[0].values) return;
      const ids = res[0].values.map((r: any) => String(r[0]));
      this.deleteDownloadItems(ids);
    } catch (e) {
      console.error('[DbService] clearCompletedItems error:', e);
    }
  }

  public clearQueue(): void {
    if (!this.db) return;
    this.db.run(`DELETE FROM download_items WHERE status IN ('QUEUED', 'PAUSED', 'FAILED')`);
    this.save();
  }

  public retryAllFailedItems(): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = 'QUEUED', speed_bps = 0, downloaded_bytes = 0, error_message = NULL WHERE status = 'FAILED'`);
    this.save();
  }

  public updateSessionProgress(sessionId: string): void {
    if (!this.db) return;
    try {
      const res = this.db.exec(`
        SELECT 
          COUNT(*) as total_files,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_files
        FROM download_items WHERE session_id = '${sessionId}'
      `);
      if (!res.length || !res[0].values.length) return;
      const [total_files, completed_files] = res[0].values[0];
      const status = Number(total_files) > 0 && Number(completed_files) === Number(total_files) ? 'COMPLETED' : 'ACTIVE';
      this.db.run(`UPDATE sessions SET status = '${status}' WHERE id = '${sessionId}'`);
    } catch (e) {
      console.warn('[DbService] updateSessionProgress warning:', e);
    }
  }

  public renumberSessionItems(sessionId: string): DownloadItem[] {
    if (!this.db) return [];
    const items = this.getDownloadItems(sessionId);
    items.sort((a, b) => a.message_id - b.message_id);
    const padding = Math.max(3, String(items.length).length);

    items.forEach((item, index) => {
      const newSeq = index + 1;
      const formattedSeq = String(newSeq).padStart(padding, '0');
      const dir = path.dirname(item.final_path);
      const cleanFilename = item.original_filename || `file_${item.message_id}`;
      const newFinalPath = path.join(dir, `${formattedSeq}_${cleanFilename}`);

      this.db!.run(`
        UPDATE download_items 
        SET sequence_number = ${newSeq}, formatted_sequence = '${formattedSeq}', final_path = '${newFinalPath.replace(/'/g, "''")}'
        WHERE id = '${item.id.replace(/'/g, "''")}'
      `);
    });
    this.save();
    return this.getDownloadItems(sessionId);
  }

  public repairDuplicateSequenceNumbers(): void {
    if (!this.db) return;
    try {
      const res = this.db.exec(`
        SELECT session_id, COUNT(*) as cnt 
        FROM download_items 
        GROUP BY session_id, sequence_number 
        HAVING cnt > 1
      `);
      if (res.length && res[0].values.length) {
        const sessionIds = res[0].values.map(r => String(r[0]));
        for (const sId of sessionIds) {
          console.log(`[AutoRepair] Repairing duplicate sequence numbers for session: ${sId}`);
          this.renumberSessionItems(sId);
        }
      }
    } catch (e) {
      console.warn('[AutoRepair] Sequence number repair warning:', e);
    }
  }

  public repairCorruptedItemPaths(): void {
    if (!this.db) return;
    try {
      const res = this.db.exec(`
        SELECT id, final_path, temp_path, original_filename 
        FROM download_items 
        WHERE final_path LIKE '%:%' OR final_path LIKE '%|%' OR final_path LIKE '%»%' OR final_path LIKE '%«%'
      `);
      if (res.length && res[0].values.length) {
        for (const row of res[0].values) {
          const id = String(row[0]);
          const finalPath = String(row[1]);
          const originalFilename = String(row[3] || '');

          const dir = path.dirname(finalPath);
          const filename = path.basename(finalPath);
          const ext = path.extname(filename);
          const base = filename.slice(0, filename.length - ext.length);
          const cleanBase = base.replace(/[\\/:*?"<>|\r\n\t»«|]/g, '_').trim().replace(/\.+$/, '').substring(0, 85);
          const cleanFinalPath = path.join(dir, `${cleanBase}${ext}`);
          const cleanOriginal = originalFilename.replace(/[\\/:*?"<>|\r\n\t»«|]/g, '_').trim().substring(0, 85);

          this.db.run(`
            UPDATE download_items 
            SET final_path = '${cleanFinalPath.replace(/'/g, "''")}', original_filename = '${cleanOriginal.replace(/'/g, "''")}'
            WHERE id = '${id.replace(/'/g, "''")}'
          `);
        }
        this.save();
      }
    } catch (e) {
      console.warn('[DbService] Auto-repair corrupted paths warning:', e);
    }
  }

  public updateItemFinalPath(id: string, finalPath: string): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`UPDATE download_items SET final_path = ? WHERE id = ?`);
    stmt.run([finalPath, id]);
    stmt.free();
    this.save();
  }

  // Settings CRUD
  public getSetting(key: string, defaultValue: string = ''): string {
    if (!this.db) return defaultValue;
    const res = this.db.exec(`SELECT value FROM settings WHERE key = '${key}'`);
    if (!res.length || !res[0].values.length) return defaultValue;
    return res[0].values[0][0] as string;
  }

  public setSetting(key: string, value: string): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
    stmt.run([key, value]);
    stmt.free();
    this.save();
  }

  public getAllSettings(): Record<string, string> {
    if (!this.db) return {};
    const res = this.db.exec(`SELECT key, value FROM settings`);
    if (!res.length) return {};
    const settings: Record<string, string> = {};
    for (const row of res[0].values) {
      settings[row[0] as string] = row[1] as string;
    }
    return settings;
  }

  // Backup & Import
  public exportBackupJson(): string {
    const sessions = this.getSessions();
    const items = this.getDownloadItems();
    const settings = this.getAllSettings();
    return JSON.stringify({ version: '1.0', exported_at: new Date().toISOString(), sessions, items, settings }, null, 2);
  }

  public importBackupJson(jsonContent: string): { success: boolean; importedSessions: number; importedItems: number } {
    try {
      const data = JSON.parse(jsonContent);
      if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.items)) {
        throw new Error('Invalid TeleFlow backup file format.');
      }
      for (const session of data.sessions) {
        this.createSession(session);
      }
      this.addDownloadItems(data.items);
      if (data.settings && typeof data.settings === 'object') {
        for (const [k, v] of Object.entries(data.settings)) {
          this.setSetting(k, String(v));
        }
      }
      return { success: true, importedSessions: data.sessions.length, importedItems: data.items.length };
    } catch (err: any) {
      console.error('[DbService] Backup import failed:', err);
      throw new Error(err.message || 'Failed to import backup JSON');
    }
  }
}

export const dbService = new DbService();
