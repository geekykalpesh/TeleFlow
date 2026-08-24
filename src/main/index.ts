import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { dbService } from './services/dbService';
import { telegramClient } from './services/telegramClient';
import { scannerService } from './services/scannerService';
import { downloadManager } from './services/downloadManager';
import { fileOrganizer } from './services/fileOrganizer';

// Global uncaught exception handlers
process.on('uncaughtException', (err) => { console.error('Uncaught Exception in Main Process:', err); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection in Main Process:', reason); });

// Redirect user data in dev mode only
if (!app.isPackaged) {
  try {
    const customDataPath = path.join(process.cwd(), '.teleflow_data');
    if (!fs.existsSync(customDataPath)) { fs.mkdirSync(customDataPath, { recursive: true }); }
    app.setPath('userData', customDataPath);
    app.setPath('sessionData', customDataPath);
  } catch (e) {}
}

// Disable hardware acceleration to prevent GPU cache permission errors on Windows
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow: BrowserWindow | null = null;

// --- Window state persistence ---
function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): { width: number; height: number; x?: number; y?: number } {
  try {
    const statePath = getWindowStatePath();
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
  } catch (e) {}
  return { width: 1280, height: 850 };
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds), 'utf-8');
  } catch (e) {}
}

async function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 900,
    minHeight: 600,
    title: 'TeleFlow',
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0c0f17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  });

  downloadManager.setMainWindow(mainWindow);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    console.log('Loading Renderer from Dev Server URL:', devUrl);
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Save window state on close
  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    downloadManager.setMainWindow(null);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    await dbService.init();
  } catch (err) {
    console.error('Error initializing DB service:', err);
  }

  try {
    await telegramClient.init();
  } catch (err) {
    console.error('Error initializing Telegram client:', err);
  }

  registerIpcHandlers();
  createWindow();

  try {
    startAutoSync();
  } catch (err) {
    console.error('Error starting auto-sync:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
  });
});

let autoSyncTimer: NodeJS.Timeout | null = null;
function startAutoSync() {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = setInterval(async () => {
    try {
      const status = telegramClient.getStatus();
      if (!status.isAuthenticated) return;
      const res = await scannerService.syncAllSessions();
      if (res.totalAdded > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('channel-synced', res);
      }
    } catch (err) {
      console.warn('[AutoSync] Background check warning:', err);
    }
  }, 60000); // Check for new channel posts every 60 seconds
}


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); }
});

// Register global keyboard shortcuts in renderer via IPC
function registerIpcHandlers() {
  // --- Auth ---
  ipcMain.handle('auth:get-status', () => telegramClient.getStatus());
  ipcMain.handle('auth:get-credentials', () => telegramClient.getCredentials());
  ipcMain.handle('auth:configure', async (_, { apiId, apiHash, appTitle, shortName, serverEnvironment }) => {
    await telegramClient.configureCredentials(apiId, apiHash, appTitle, shortName, serverEnvironment);
    return true;
  });
  ipcMain.handle('auth:send-code', (_, phone) => telegramClient.sendCode(phone));
  ipcMain.handle('auth:sign-in', (_, code) => telegramClient.signIn(code));
  ipcMain.handle('auth:check-password', (_, password) => telegramClient.checkPassword(password));
  ipcMain.handle('auth:logout', () => telegramClient.logout());

  // --- Dialogs & Scanner & Search ---
  ipcMain.handle('telegram:get-dialogs', () => telegramClient.getDialogs());
  ipcMain.handle('telegram:search-chats', (_, query) => telegramClient.searchChats(query));
  ipcMain.handle('telegram:inspect-group-messages', (_, chatId, limit, fromMsgId, toMsgId, offsetId) =>
    telegramClient.inspectGroupMessages(chatId, limit, fromMsgId, toMsgId, offsetId)
  );

  ipcMain.handle('scanner:scan-and-enqueue', (_, options) => scannerService.scanAndEnqueue(options));
  ipcMain.handle('scanner:sync-session', (_, sessionId) => scannerService.syncSession(sessionId));
  ipcMain.handle('scanner:sync-all', () => scannerService.syncAllSessions());


  // --- DB & Queue ---
  ipcMain.handle('db:get-sessions', () => dbService.getSessions());
  ipcMain.handle('db:get-items', (_, sessionId) => dbService.getDownloadItems(sessionId));
  ipcMain.handle('queue:start', () => downloadManager.startQueue());
  ipcMain.handle('queue:pause', () => downloadManager.pauseQueue());
  ipcMain.handle('queue:pause-item', (_, id) => downloadManager.pauseItem(id));
  ipcMain.handle('queue:resume-item', (_, id) => downloadManager.resumeItem(id));
  ipcMain.handle('queue:retry-item', (_, id) => downloadManager.retryItem(id));
  ipcMain.handle('queue:retry-all-failed', () => downloadManager.retryAllFailed());
  ipcMain.handle('queue:set-concurrency', (_, n) => downloadManager.setConcurrency(n));
  ipcMain.handle('db:delete-session', (_, id) => dbService.deleteSession(id));
  ipcMain.handle('db:clear-queue', () => dbService.clearQueue());
  ipcMain.handle('organizer:renumber', (_, sessionId) => fileOrganizer.renumberSessionFolder(sessionId));

  // --- Native Utilities ---
  ipcMain.handle('dialog:select-directory', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (!res.canceled && res.filePaths.length > 0) return res.filePaths[0];
    return null;
  });

  ipcMain.handle('shell:open-path', async (_, filePath) => {
    if (filePath) await shell.openPath(filePath);
  });

  ipcMain.handle('shell:open-folder', async (_, folderPath) => {
    if (folderPath) await shell.openPath(path.dirname(folderPath) || folderPath);
  });

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-default-downloads', () => app.getPath('downloads'));
}
