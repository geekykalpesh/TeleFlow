import { contextBridge, ipcRenderer } from 'electron';
import { ScanOptions } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  configureCredentials: (apiId: number, apiHash: string, appTitle?: string, shortName?: string, serverEnvironment?: 'production' | 'test') =>
    ipcRenderer.invoke('auth:configure', { apiId, apiHash, appTitle, shortName, serverEnvironment }),
  sendAuthCode: (phone: string) => ipcRenderer.invoke('auth:send-code', phone),
  signIn: (code: string) => ipcRenderer.invoke('auth:sign-in', code),
  checkPassword: (password: string) => ipcRenderer.invoke('auth:check-password', password),
  logout: () => ipcRenderer.invoke('auth:logout'),

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
  retryAllFailed: () => ipcRenderer.invoke('queue:retry-all-failed'),
  setConcurrency: (n: number) => ipcRenderer.invoke('queue:set-concurrency', n),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('db:delete-session', sessionId),
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
