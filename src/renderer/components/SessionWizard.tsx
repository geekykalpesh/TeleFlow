import React, { useState, useEffect } from 'react';
import { TelegramChat, ScanOptions, MediaType } from '../../types';
import { Folder, Search, Sliders, CheckSquare, X, ListOrdered } from 'lucide-react';

interface SessionWizardProps {
  onClose: () => void;
  onCreated: () => void;
}

export const SessionWizard: React.FC<SessionWizardProps> = ({ onClose, onCreated }) => {
  const [dialogs, setDialogs] = useState<TelegramChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<TelegramChat | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromMsgId, setFromMsgId] = useState<string>('');
  const [toMsgId, setToMsgId] = useState<string>('');
  const [destinationPath, setDestinationPath] = useState('');
  const [downloadMode, setDownloadMode] = useState<'sequential' | 'parallel'>('sequential');
  const [concurrency, setConcurrency] = useState(1);
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>(['video', 'document', 'audio', 'photo']);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [loadingTopics, setLoadingTopics] = useState(false);

  useEffect(() => {
    loadDialogs();
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadTopics(selectedChat.id);
    } else {
      setTopics([]);
    }
  }, [selectedChat]);

  const getApi = () => {
    const api = (window as any).electronAPI;
    if (!api) {
      throw new Error('Electron API is not initialized. Please ensure you are running inside TeleFlow.');
    }
    return api;
  };

  const loadTopics = async (chatId: string) => {
    setLoadingTopics(true);
    try {
      const api = getApi();
      const res = await api.getForumTopics(chatId);
      setTopics(res || []);
      setSelectedTopicId('all');
    } catch (e) {
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadDialogs = async () => {
    setLoading(true);
    try {
      const api = getApi();
      const res = await api.getDialogs();
      setDialogs(res || []);
      if (res && res.length > 0) {
        setSelectedChat(res[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Telegram dialogs');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const api = getApi();
      const folder = await api.selectDirectory();
      if (folder) {
        setDestinationPath(folder);
      }
    } catch (err) {}
  };

  const toggleMediaType = (type: MediaType) => {
    if (mediaTypes.includes(type)) {
      setMediaTypes(mediaTypes.filter((t) => t !== type));
    } else {
      setMediaTypes([...mediaTypes, type]);
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat) return;

    setScanning(true);
    setError(null);

    const chosenTopic = selectedTopicId !== 'all' ? topics.find(t => String(t.id) === selectedTopicId) : undefined;

    const options: ScanOptions = {
      chat_id: selectedChat.id,
      chat_title: selectedChat.title,
      topic_id: chosenTopic ? chosenTopic.id : undefined,
      topic_title: chosenTopic ? chosenTopic.title : undefined,
      from_message_id: fromMsgId ? parseInt(fromMsgId, 10) : undefined,
      to_message_id: toMsgId ? parseInt(toMsgId, 10) : undefined,
      media_types: mediaTypes,
      destination_path: destinationPath || undefined,
      download_mode: downloadMode,
      concurrency: downloadMode === 'sequential' ? 1 : concurrency
    };

    try {
      const api = getApi();
      if (topics.length > 0 && selectedTopicId === 'all') {
        await api.scanAllTopics(options);
      } else {
        await api.scanAndEnqueue(options);
      }
      await api.startQueue();
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to scan channel messages');
    } finally {
      setScanning(false);
    }
  };

  const filteredDialogs = dialogs.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content" style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
          Create Download Session
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Select a Telegram channel and configure deterministic sequence ordering.
        </p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleStartSession}>
          {/* Step 1: Select Channel / Chat */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              1. SELECT TELEGRAM CHANNEL / CHAT
            </label>

            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search channel or group..."
                className="input-field"
                style={{ paddingLeft: '36px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{
              maxHeight: '160px',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.2)'
            }}>
              {loading ? (
                <p style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>Loading channels...</p>
              ) : filteredDialogs.length === 0 ? (
                <p style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>No channels found</p>
              ) : (
                filteredDialogs.map((dialog) => (
                  <div
                    key={dialog.id}
                    onClick={() => setSelectedChat(dialog)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: selectedChat?.id === dialog.id ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                      borderLeft: selectedChat?.id === dialog.id ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)'
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dialog.title}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{dialog.type.toUpperCase()}</p>
                    </div>
                    {selectedChat?.id === dialog.id && <CheckSquare size={16} color="var(--accent-cyan)" />}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Forum Topics Selector */}
          {selectedChat && topics.length > 0 && (
            <div style={{ marginBottom: '20px', padding: '12px 14px', background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.25)', borderRadius: '8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00d4ff', display: 'block', marginBottom: '8px' }}>
                💬 FORUM GROUP TOPICS DETECTED ({topics.length} TOPICS)
              </label>
              <select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="input-field"
                style={{ width: '100%', background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="all">📂 Download All Topics (Auto Create Sub-Folders)</option>
                {topics.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    💬 {t.title} ({t.messagesCount || 0} messages)
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                {selectedTopicId === 'all'
                  ? 'All topics will be scanned and saved into separate subfolders inside the main group folder.'
                  : 'Only messages from the selected topic thread will be downloaded into its topic folder.'}
              </p>
            </div>
          )}

          {/* Step 2: Message Range Filtering */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              2. MESSAGE RANGE (OPTIONAL)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>From Message ID</span>
                <input
                  type="number"
                  placeholder="e.g. 100"
                  className="input-field"
                  value={fromMsgId}
                  onChange={(e) => setFromMsgId(e.target.value)}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>To Message ID</span>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  className="input-field"
                  value={toMsgId}
                  onChange={(e) => setToMsgId(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Step 3: Destination Folder */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              3. TARGET DESTINATION FOLDER
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Default Downloads folder"
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.target.value)}
              />
              <button type="button" onClick={handleSelectFolder} className="btn btn-secondary">
                <Folder size={16} /> Browse
              </button>
            </div>
          </div>

          {/* Step 4: Download Mode & Concurrency */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              4. DOWNLOAD CONCURRENCY MODE
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div
                onClick={() => { setDownloadMode('sequential'); setConcurrency(1); }}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: downloadMode === 'sequential' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  background: downloadMode === 'sequential' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  <ListOrdered size={16} color="var(--accent-cyan)" /> Sequential (1 by 1)
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Downloads files one at a time in exact order.</p>
              </div>

              <div
                onClick={() => setDownloadMode('parallel')}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: downloadMode === 'parallel' ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
                  background: downloadMode === 'parallel' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  <Sliders size={16} color="var(--accent-purple)" /> Parallel Mode
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Concurrent downloads with fixed sequence numbers.</p>
              </div>
            </div>

            {downloadMode === 'parallel' && (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Parallel Workers: {concurrency}</span>
                <input
                  type="range"
                  min="2"
                  max="5"
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!selectedChat || scanning}>
              {scanning ? 'Scanning & Sequencing...' : 'Start Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
