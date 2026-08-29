import { contextBridge, ipcRenderer } from 'electron';
import { ScanOptions } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  getCredentials: () => ipcRenderer.invoke('auth:get-credentials'),
  configureCredentials: (apiId: number, apiHash: string, appTitle?: string, shortName?: string, serverEnvironment?: 'production' | 'test') =>
    ipcRenderer.invoke('auth:configure', { apiId, apiHash, appTitle, shortName, serverEnvironment }),
  sendAuthCode: (phone: string) => ipcRenderer.invoke('auth:send-code', phone),
  signIn: (code: string) => ipcRenderer.invoke('auth:sign-in', code),
  checkPassword: (password: string) => ipcRenderer.invoke('auth:check-password', password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAllSettings: () => ipcRenderer.invoke('settings:get-all'),
  setDefaultFolder: (folderPath: string) => ipcRenderer.invoke('settings:set-default-folder', folderPath),
  setSpeedLimit: (bps: number) => ipcRenderer.invoke('settings:set-speed-limit', bps),
  getSpeedLimit: () => ipcRenderer.invoke('settings:get-speed-limit'),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: (jsonContent: string) => ipcRenderer.invoke('backup:import', jsonContent),

  // Dialogs & Scanner
  getDialogs: () => ipcRenderer.invoke('telegram:get-dialogs'),
  searchChats: (query: string) => ipcRenderer.invoke('telegram:search-chats', query),
  inspectGroupMessages: (chatId: string, limit?: number, fromMsgId?: number, toMsgId?: number, offsetId?: number) =>
    ipcRenderer.invoke('telegram:inspect-group-messages', chatId, limit, fromMsgId, toMsgId, offsetId),

  scanAndEnqueue: (options: ScanOptions) => ipcRenderer.invoke('scanner:scan-and-enqueue', options),
  syncSession: (sessionId: string) => ipcRenderer.invoke('scanner:sync-session', sessionId),
  syncAllSessions: () => ipcRenderer.invoke('scanner:sync-all'),


  // Queue & Sessions & Item Control
  getSessions: () => ipcRenderer.invoke('db:get-sessions'),
  getDownloadItems: (sessionId?: string) => ipcRenderer.invoke('db:get-items', sessionId),
  startQueue: () => ipcRenderer.invoke('queue:start'),
  pauseQueue: () => ipcRenderer.invoke('queue:pause'),
  pauseItem: (id: string) => ipcRenderer.invoke('queue:pause-item', id),
  resumeItem: (id: string) => ipcRenderer.invoke('queue:resume-item', id),
  retryItem: (id: string) => ipcRenderer.invoke('queue:retry-item', id),
  pauseSession: (sessionId: string) => ipcRenderer.invoke('queue:pause-session', sessionId),
  resumeSession: (sessionId: string) => ipcRenderer.invoke('queue:resume-session', sessionId),
  retrySession: (sessionId: string) => ipcRenderer.invoke('queue:retry-session', sessionId),
  pauseAll: () => ipcRenderer.invoke('queue:pause-all'),
  resumeAll: () => ipcRenderer.invoke('queue:resume-all'),
  pauseItems: (ids: string[]) => ipcRenderer.invoke('queue:pause-items', ids),
  resumeItems: (ids: string[]) => ipcRenderer.invoke('queue:resume-items', ids),
  prioritizeItems: (ids: string[]) => ipcRenderer.invoke('queue:prioritize-items', ids),
  retryAllFailed: () => ipcRenderer.invoke('queue:retry-all-failed'),
  setConcurrency: (n: number) => ipcRenderer.invoke('queue:set-concurrency', n),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('db:delete-session', sessionId),
  deleteItems: (ids: string[], deleteFiles: boolean) => ipcRenderer.invoke('db:delete-items', ids, deleteFiles),
  clearQueue: () => ipcRenderer.invoke('db:clear-queue'),
  renumberSession: (sessionId: string) => ipcRenderer.invoke('organizer:renumber', sessionId),

  // Native Utilities
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  openFolder: (filePath: string) => ipcRenderer.invoke('shell:open-folder', filePath),
  getDefaultDownloads: () => ipcRenderer.invoke('app:get-default-downloads'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  // Progress listener
  onDownloadProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  onChannelSynced: (callback: (data: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('channel-synced', subscription);
    return () => ipcRenderer.removeListener('channel-synced', subscription);
  }
});
