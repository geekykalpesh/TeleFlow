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
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );
    `);

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
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Reset DOWNLOADING items back to QUEUED on startup to handle crash recovery cleanly
    this.db.run(`UPDATE download_items SET status = 'QUEUED' WHERE status = 'DOWNLOADING'`);
    this.save();
  }

  public save(): void {
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
        download_mode, concurrency, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      session.id, session.title, session.chat_id, session.chat_title,
      session.from_message_id || null, session.to_message_id || null,
      session.destination_path, session.add_sequence_prefix ? 1 : 0,
      session.sequence_padding, session.download_mode, session.concurrency,
      session.created_at, session.status
    ]);
    stmt.free();
    this.save();
  }

  public getSessions(): DownloadSession[] {
    if (!this.db) return [];
    const res = this.db.exec(`SELECT * FROM sessions ORDER BY created_at DESC`);
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
        total_files: stats.total_files,
        completed_files: stats.completed_files,
        total_bytes: stats.total_bytes,
        downloaded_bytes: stats.downloaded_bytes
      };
    });
  }

  public getSessionById(sessionId: string): DownloadSession | null {

    if (!this.db) return null;
    const res = this.db.exec(`SELECT * FROM sessions WHERE id = '${sessionId}'`);
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
        temp_path, final_path, error_message, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      stmt.run([
        item.id, item.session_id, item.chat_id, item.chat_title, item.message_id,
        item.sequence_number, item.formatted_sequence, item.media_type,
        item.original_filename, item.extension, item.mime_type,
        item.telegram_file_id || null, item.total_bytes, item.downloaded_bytes,
        item.speed_bps, item.status, item.temp_path, item.final_path,
        item.error_message || null, item.created_at, item.completed_at || null
      ]);
    }
    stmt.free();
    this.save();
  }

  public getDownloadItems(sessionId?: string): DownloadItem[] {
    if (!this.db) return [];
    let query = `SELECT * FROM download_items`;
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
      completed_at: row[20]
    }));
  }

  public getItemById(id: string): DownloadItem | null {
    if (!this.db) return null;
    const res = this.db.exec(`SELECT * FROM download_items WHERE id = '${id}'`);
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
      completed_at: row[20] as string
    };
  }

  public getNextQueuedItem(sessionId?: string): DownloadItem | null {

    if (!this.db) return null;
    let query = `SELECT * FROM download_items WHERE status = 'QUEUED'`;
    if (sessionId) {
      query += ` AND session_id = '${sessionId}'`;
    }
    query += ` ORDER BY sequence_number ASC LIMIT 1`;

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
      completed_at: row[20] as string
    };
  }

  public updateItemStatus(id: string, status: string): void {
    if (!this.db) return;
    this.db.run(`UPDATE download_items SET status = '${status}', speed_bps = 0 WHERE id = '${id}'`);
    this.save();
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
  }

  public deleteSession(sessionId: string): void {
    if (!this.db) return;
    this.db.run(`DELETE FROM download_items WHERE session_id = '${sessionId}'`);
    this.db.run(`DELETE FROM sessions WHERE id = '${sessionId}'`);
    this.save();
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
    const res = this.db.exec(`
      SELECT 
        COUNT(*) as total_files,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_files,
        SUM(downloaded_bytes) as downloaded_bytes
      FROM download_items WHERE session_id = '${sessionId}'
    `);
    if (!res.length || !res[0].values.length) return;
    const [total_files, completed_files, downloaded_bytes] = res[0].values[0];
    const status = Number(total_files) > 0 && Number(completed_files) === Number(total_files) ? 'COMPLETED' : 'ACTIVE';
    this.db.run(`
      UPDATE sessions SET 
        completed_files = ${Number(completed_files) || 0},
        downloaded_bytes = ${Number(downloaded_bytes) || 0},
        status = '${status}'
      WHERE id = '${sessionId}'
    `);
    this.save();
  }

  public renumberSessionItems(sessionId: string): DownloadItem[] {

    if (!this.db) return [];
    const items = this.getDownloadItems(sessionId);
    items.forEach((item, index) => {
      const newSeq = index + 1;
      const formattedSeq = String(newSeq).padStart(3, '0');
      this.db!.run(`
        UPDATE download_items 
        SET sequence_number = ${newSeq}, formatted_sequence = '${formattedSeq}'
        WHERE id = '${item.id}'
      `);
    });
    this.save();
    return this.getDownloadItems(sessionId);
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
}

export const dbService = new DbService();
