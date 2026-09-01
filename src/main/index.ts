import { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu, nativeImage } from 'electron';
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
let tray: Tray | null = null;
let isQuitting: boolean = false;

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

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, '../dist/logo.png'),
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(app.getAppPath(), 'dist/logo.png'),
    path.join(app.getAppPath(), 'public/logo.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'build', 'icon.png')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return '';
}

function createTray() {
  if (tray) return;

  const iconPath = getAppIconPath();
  console.log('[Tray] Loading tray icon from:', iconPath);

  let trayIcon: ReturnType<typeof nativeImage.createFromPath>;
  if (iconPath && fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (!trayIcon.isEmpty()) {
      trayIcon = trayIcon.resize({ width: 16, height: 16, quality: 'best' });
    } else {
      console.warn('[Tray] Loaded icon image was empty:', iconPath);
      trayIcon = nativeImage.createEmpty();
    }
  } else {
    console.warn('[Tray] Could not locate icon path for system tray');
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('TeleFlow — Running in background');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open TeleFlow',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Start Queue',
      click: () => { downloadManager.startQueue(); }
    },
    {
      label: 'Pause Queue',
      click: () => { downloadManager.pauseQueue(); }
    },
    { type: 'separator' },
    {
      label: 'Quit TeleFlow',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.focus();
        } else {
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

async function createWindow() {
  const windowState = loadWindowState();
  const appIconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 900,
    minHeight: 600,
    title: 'TeleFlow',
    icon: appIconPath || undefined,
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

  // Intercept window close to run in system tray background unless explicitly quitting
  mainWindow.on('close', (e) => {
    if (mainWindow) saveWindowState(mainWindow);
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      return false;
    }
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
  createTray();

  try {
    startAutoSync();
  } catch (err) {
    console.error('Error starting auto-sync:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
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
  if (isQuitting && process.platform !== 'darwin') { app.quit(); }
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
  ipcMain.handle('settings:get-all', () => dbService.getAllSettings());
  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    dbService.setSetting(key, value);
    return true;
  });
  ipcMain.handle('settings:set-default-folder', (_, folderPath: string) => {
    dbService.setSetting('default_destination', folderPath);
    return true;
  });
  ipcMain.handle('settings:set-speed-limit', (_, bps: number) => {
    downloadManager.setSpeedLimit(bps);
    return true;
  });
  ipcMain.handle('settings:get-speed-limit', () => downloadManager.getSpeedLimit());
  ipcMain.handle('backup:export', () => dbService.exportBackupJson());
  ipcMain.handle('backup:import', (_, jsonContent: string) => dbService.importBackupJson(jsonContent));

  // --- Dialogs & Scanner & Search ---
  ipcMain.handle('telegram:get-dialogs', () => telegramClient.getDialogs());
  ipcMain.handle('telegram:search-chats', (_, query) => telegramClient.searchChats(query));
  ipcMain.handle('telegram:get-forum-topics', (_, chatId) => telegramClient.getForumTopics(chatId));
  ipcMain.handle('telegram:inspect-group-messages', (_, chatId, limit, fromMsgId, toMsgId, offsetId, replyTo) =>
    telegramClient.inspectGroupMessages(chatId, limit, fromMsgId, toMsgId, offsetId, replyTo)
  );

  ipcMain.handle('scanner:scan-and-enqueue', (_, options) => scannerService.scanAndEnqueue(options));
  ipcMain.handle('scanner:scan-all-topics', (_, options) => scannerService.scanAndEnqueueAllTopics(options));
  ipcMain.handle('scanner:sync-session', (_, sessionId) => scannerService.syncSession(sessionId));
  ipcMain.handle('scanner:sync-all', () => scannerService.syncAllSessions());


  // --- DB & Queue ---
  ipcMain.handle('db:get-sessions', () => dbService.getSessions());
  ipcMain.handle('db:get-items', (_, sessionId) => dbService.getDownloadItems(sessionId));
  ipcMain.handle('queue:start', () => { downloadManager.startQueue(); return { success: true }; });
  ipcMain.handle('queue:pause', () => { downloadManager.pauseQueue(); return { success: true }; });
  ipcMain.handle('queue:pause-item', (_, id) => { downloadManager.pauseItem(id); return { success: true }; });
  ipcMain.handle('queue:resume-item', (_, id) => { downloadManager.resumeItem(id); return { success: true }; });
  ipcMain.handle('queue:retry-item', (_, id) => { downloadManager.retryItem(id); return { success: true }; });
  ipcMain.handle('queue:pause-session', (_, sessionId) => { downloadManager.pauseSession(sessionId); return { success: true }; });
  ipcMain.handle('queue:resume-session', (_, sessionId) => { downloadManager.resumeSession(sessionId); return { success: true }; });
  ipcMain.handle('queue:retry-session', (_, sessionId) => { downloadManager.retrySession(sessionId); return { success: true }; });
  ipcMain.handle('queue:pause-all', () => { downloadManager.pauseAll(); return { success: true }; });
  ipcMain.handle('queue:resume-all', () => { downloadManager.resumeAll(); return { success: true }; });
  ipcMain.handle('queue:pause-items', (_, ids: string[]) => { downloadManager.pauseItems(ids); return { success: true }; });
  ipcMain.handle('queue:resume-items', (_, ids: string[]) => { downloadManager.resumeItems(ids); return { success: true }; });
  ipcMain.handle('queue:prioritize-items', (_, ids: string[]) => { downloadManager.prioritizeItems(ids); return { success: true }; });
  ipcMain.handle('queue:retry-all-failed', () => { downloadManager.retryAllFailed(); return { success: true }; });
  ipcMain.handle('queue:set-concurrency', (_, n) => downloadManager.setConcurrency(n));
  ipcMain.handle('db:delete-session', (_, id: string, deleteFiles: boolean) => {
    downloadManager.pauseSession(id);
    dbService.deleteSession(id, deleteFiles);
    return { success: true };
  });
  ipcMain.handle('db:update-session-flags', (_, id: string, flags: { download_enabled?: boolean; sync_enabled?: boolean }) => {
    dbService.updateSessionFlags(id, flags);
    if (flags.download_enabled === false) {
      downloadManager.pauseSession(id);
    } else if (flags.download_enabled === true) {
      downloadManager.startQueue();
    }
    return { success: true };
  });
  ipcMain.handle('db:clear-completed', (_, sessionId?: string) => { dbService.clearCompletedItems(sessionId); return { success: true }; });
  ipcMain.handle('db:delete-items', async (_, ids: string[], deleteFiles: boolean) => {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0 };
    for (const id of ids) {
      try { telegramClient.abortDownload(id); } catch (e) {}
      if (deleteFiles) {
        const item = dbService.getItemById(id);
        if (item) {
          if (item.temp_path && fs.existsSync(item.temp_path)) {
            try { fs.rmSync(item.temp_path, { force: true }); } catch (e) {}
          }
          if (item.final_path && fs.existsSync(item.final_path)) {
            try { fs.rmSync(item.final_path, { force: true }); } catch (e) {}
          }
        }
      }
    }
    dbService.deleteDownloadItems(ids);
    return { success: true, deletedCount: ids.length };
  });
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
