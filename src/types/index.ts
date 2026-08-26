export type DownloadStatus = 'QUEUED' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED' | 'PAUSED';

export type MediaType = 'video' | 'audio' | 'document' | 'photo' | 'voice' | 'text' | 'link' | 'unknown';

export interface DownloadItem {
  id: string;
  session_id: string;
  chat_id: string;
  chat_title: string;
  message_id: number;
  sequence_number: number;
  formatted_sequence: string; // e.g. "001"
  media_type: MediaType;
  original_filename: string;
  extension: string;
  mime_type: string;
  telegram_file_id?: string;
  total_bytes: number;
  downloaded_bytes: number;
  speed_bps: number;
  status: DownloadStatus;
  temp_path: string;
  final_path: string;
  text_content?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface DownloadSession {
  id: string;
  title: string;
  chat_id: string;
  chat_title: string;
  from_message_id?: number;
  to_message_id?: number;
  destination_path: string;
  add_sequence_prefix: boolean;
  sequence_padding: number;
  download_mode: 'sequential' | 'parallel';
  concurrency: number;
  created_at: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  total_files: number;
  completed_files: number;
  total_bytes: number;
  downloaded_bytes: number;
}

export interface TelegramUser {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface TelegramAuthStatus {
  isAuthenticated: boolean;
  step: 'LOGGED_OUT' | 'WAITING_PHONE' | 'WAITING_CODE' | 'WAITING_PASSWORD' | 'LOGGED_IN';
  user?: TelegramUser;
  error?: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  username?: string;
  type: 'channel' | 'group' | 'user' | 'chat';
  unreadCount: number;
  hasMedia: boolean;
  participantsCount?: number;
}

export interface GroupMessageItem {
  message_id: number;
  date: string;
  sender_name?: string;
  media_type: MediaType;
  filename: string;
  size: number;
  mime_type: string;
  text?: string;
  text_content?: string;
}

export interface ScanOptions {
  chat_id: string;
  chat_title: string;
  from_message_id?: number;
  to_message_id?: number;
  limit?: number;
  media_types?: MediaType[];
  session_title?: string;
  destination_path?: string;
  download_mode?: 'sequential' | 'parallel';
  concurrency?: number;
  selected_message_ids?: number[];
}

export interface AppSettings {
  apiId: string;
  apiHash: string;
  appTitle?: string;
  shortName?: string;
  serverEnvironment?: 'production' | 'test';
  defaultDestination: string;
  defaultConcurrency: number;
  defaultMode: 'sequential' | 'parallel';
}
