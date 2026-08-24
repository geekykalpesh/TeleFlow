import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Fallback mock bridge when running in a web browser for UI testing
if (!(window as any).electronAPI) {
  console.warn('Running outside Electron desktop shell. Initializing Web Browser fallback API mock.');
  (window as any).electronAPI = {
    getAuthStatus: async () => ({
      isAuthenticated: Boolean(localStorage.getItem('mock_auth')),
      step: localStorage.getItem('mock_auth') ? 'LOGGED_IN' : 'LOGGED_OUT',
      user: localStorage.getItem('mock_auth') ? { firstName: 'TeleFlow User', phone: '+1234567890' } : undefined
    }),
    configureCredentials: async (apiId: number, apiHash: string) => {
      localStorage.setItem('mock_api_id', String(apiId));
      localStorage.setItem('mock_api_hash', apiHash);
      return true;
    },
    sendAuthCode: async (phone: string) => {
      localStorage.setItem('mock_phone', phone);
      return { isAuthenticated: false, step: 'WAITING_CODE' };
    },
    signIn: async (code: string) => {
      localStorage.setItem('mock_auth', 'true');
      return { isAuthenticated: true, step: 'LOGGED_IN', user: { firstName: 'TeleFlow User', phone: localStorage.getItem('mock_phone') || '+1234567890' } };
    },
    checkPassword: async () => {
      localStorage.setItem('mock_auth', 'true');
      return { isAuthenticated: true, step: 'LOGGED_IN' };
    },
    logout: async () => {
      localStorage.removeItem('mock_auth');
    },
    getDialogs: async () => [
      { id: '-100123456789', title: 'React & Tech Course 2026', type: 'channel', unreadCount: 12, hasMedia: true },
      { id: '-100987654321', title: 'UI Design Assets & Clips', type: 'channel', unreadCount: 5, hasMedia: true }
    ],
    scanAndEnqueue: async (options: any) => ({
      id: `session_${Date.now()}`,
      title: options.session_title || `Session - ${options.chat_title}`,
      chat_id: options.chat_id,
      chat_title: options.chat_title,
      destination_path: options.destination_path || 'C:/Downloads/TeleFlow',
      add_sequence_prefix: true,
      sequence_padding: 3,
      download_mode: options.download_mode || 'sequential',
      concurrency: options.concurrency || 1,
      created_at: new Date().toISOString(),
      status: 'ACTIVE',
      total_files: 5,
      completed_files: 0,
      total_bytes: 52428800,
      downloaded_bytes: 0
    }),
    getSessions: async () => [],
    getDownloadItems: async () => [],
    startQueue: async () => {},
    pauseQueue: async () => {},
    setConcurrency: async () => {},
    deleteSession: async () => {},
    clearQueue: async () => {},
    renumberSession: async () => [],
    selectDirectory: async () => 'C:/Downloads/TeleFlow',
    openPath: async () => {},
    onDownloadProgress: () => () => {}
  };
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
