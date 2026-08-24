import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { QueueView } from './components/QueueView';
import { ChannelExplorer } from './components/ChannelExplorer';
import { RenumberTool } from './components/RenumberTool';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { SessionWizard } from './components/SessionWizard';
import { DownloadItem, DownloadSession, TelegramAuthStatus } from '../types';
import { FolderCheck, Trash2, RefreshCw, FolderOpen, Play, Pause } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'queue' | 'explorer' | 'sessions' | 'renumber' | 'settings'>('queue');
  const [authStatus, setAuthStatus] = useState<TelegramAuthStatus>({ isAuthenticated: false, step: 'LOGGED_OUT' });
  const [sessions, setSessions] = useState<DownloadSession[]>([]);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSessionWizard, setShowSessionWizard] = useState(false);
  const [isQueueRunning, setIsQueueRunning] = useState(true);

  useEffect(() => {
    fetchAuthStatus();
    fetchSessions();
    fetchDownloadItems();

    // Real-time download progress via IPC
    const unsubscribe = (window as any).electronAPI?.onDownloadProgress?.((data: any) => {
      setDownloadItems((prev) =>
        prev.map((item) => {
          if (item.id === data.id) {
            return {
              ...item,
              status: data.status,
              downloaded_bytes: data.downloaded_bytes,
              total_bytes: data.total_bytes,
              speed_bps: data.speed_bps,
              error_message: data.error_message,
              final_path: data.final_path || item.final_path
            };
          }
          return item;
        })
      );
      // Also refresh sessions to update progress bars
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        fetchSessions();
      }
    });

    const unSubSynced = (window as any).electronAPI?.onChannelSynced?.((res: any) => {
      console.log('[AutoSync] Received sync update:', res);
      fetchSessions();
      fetchDownloadItems();
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (unSubSynced) unSubSynced();
    };
  }, []);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r': case 'R':
            e.preventDefault();
            fetchSessions();
            fetchDownloadItems();
            break;
          case 'p': case 'P':
            e.preventDefault();
            handleToggleQueue();
            break;
          case ',':
            e.preventDefault();
            setActiveTab('settings');
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQueueRunning]);

  const fetchAuthStatus = async () => {
    try {
      const res = await (window as any).electronAPI.getAuthStatus();
      if (res) setAuthStatus(res);
    } catch (err) { console.error(err); }
  };

  const fetchSessions = async () => {
    try {
      const res = await (window as any).electronAPI.getSessions();
      setSessions(res || []);
    } catch (err) { console.error(err); }
  };

  const fetchDownloadItems = async () => {
    try {
      const res = await (window as any).electronAPI.getDownloadItems(selectedSessionId || undefined);
      setDownloadItems(res || []);
    } catch (err) { console.error(err); }
  };

  const handleToggleQueue = async () => {
    if (isQueueRunning) {
      await (window as any).electronAPI.pauseQueue();
      setIsQueueRunning(false);
    } else {
      await (window as any).electronAPI.startQueue();
      setIsQueueRunning(true);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (confirm('Delete this session and all its download records?')) {
      await (window as any).electronAPI.deleteSession(sessionId);
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
      fetchSessions();
      fetchDownloadItems();
    }
  };

  const handleClearQueue = async () => {
    if (confirm('Clear all queued and failed items?')) {
      await (window as any).electronAPI.clearQueue();
      fetchDownloadItems();
    }
  };

  const handleSelectSessionFilter = (id: string | null) => {
    setSelectedSessionId(id);
    (window as any).electronAPI.getDownloadItems(id || undefined).then((res: DownloadItem[]) => {
      setDownloadItems(res || []);
    });
  };

  const handleOpenFolder = (path: string) => {
    (window as any).electronAPI?.openPath?.(path);
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const handleSyncAllChannels = async () => {
    setIsSyncingAll(true);
    try {
      await (window as any).electronAPI?.syncAllSessions?.();
      await fetchSessions();
      await fetchDownloadItems();
    } catch (e) {
      console.error('Sync all failed:', e);
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        authStatus={authStatus}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenNewSession={() => {
          if (!authStatus.isAuthenticated) setShowAuthModal(true);
          else setShowSessionWizard(true);
        }}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={handleSelectSessionFilter}
        isQueueRunning={isQueueRunning}
        onToggleQueue={handleToggleQueue}
      />

      <div className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, textTransform: 'capitalize' }}>
              {activeTab === 'queue' ? 'Download Queue & Metrics'
                : activeTab === 'explorer' ? 'Group & Channel Explorer'
                : activeTab === 'sessions' ? 'Download Sessions'
                : activeTab === 'renumber' ? 'File Renumber Tool'
                : 'Settings'}
            </h2>
            {selectedSessionId && (
              <span className="badge" style={{ background: 'rgba(0,212,255,0.15)', color: 'var(--accent-cyan)' }}>
                Filtered: {sessions.find(s => s.id === selectedSessionId)?.title || 'Session'}
              </span>
            )}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Ctrl+R Refresh · Ctrl+P Pause/Resume · Ctrl+, Settings
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={handleSyncAllChannels} disabled={isSyncingAll} className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '5px' }}>
              <RefreshCw size={13} className={isSyncingAll ? 'spin' : ''} /> {isSyncingAll ? 'Syncing Channels...' : 'Sync All Channels'}
            </button>
            <button onClick={() => { fetchSessions(); fetchDownloadItems(); }} className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button onClick={handleToggleQueue} className={`btn ${isQueueRunning ? 'btn-secondary' : 'btn-primary'}`} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
              {isQueueRunning ? <><Pause size={13} /> Pause All</> : <><Play size={13} /> Resume All</>}
            </button>
          </div>
        </header>

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <QueueView
            items={downloadItems}
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={handleSelectSessionFilter}
            onClearQueue={handleClearQueue}
            onRefresh={() => { fetchSessions(); fetchDownloadItems(); }}
          />
        )}


        {/* Explorer Tab */}
        {activeTab === 'explorer' && (
          <ChannelExplorer
            onSessionCreated={() => {
              fetchSessions();
              fetchDownloadItems();
              setActiveTab('queue');
            }}
          />
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Download Sessions</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Manage Telegram channel download sessions.</p>
              </div>
              <button onClick={() => { if (!authStatus.isAuthenticated) setShowAuthModal(true); else setShowSessionWizard(true); }} className="btn btn-primary">
                + New Download Session
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FolderCheck size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ fontSize: '1rem', fontWeight: 600 }}>No Sessions Created Yet</p>
                <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Scan a Telegram channel to create a download session.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                {sessions.map((s) => {
                  const percent = s.total_bytes > 0 ? Math.min(100, Math.round((s.downloaded_bytes / s.total_bytes) * 100)) : 0;
                  const filePercent = s.total_files > 0 ? Math.round((s.completed_files / s.total_files) * 100) : 0;
                  return (
                    <div key={s.id} className="glass-panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</h3>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.chat_title}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                            background: s.status === 'COMPLETED' ? 'rgba(16,185,129,0.2)' : s.status === 'PAUSED' ? 'rgba(245,158,11,0.2)' : 'rgba(0,212,255,0.15)',
                            color: s.status === 'COMPLETED' ? '#10b981' : s.status === 'PAUSED' ? '#f59e0b' : '#00d4ff'
                          }}>
                            {s.status}
                          </span>
                          <button onClick={() => handleDeleteSession(s.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '2px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          <span>{s.completed_files} / {s.total_files} files</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{filePercent}%</span>
                        </div>
                        <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${filePercent}%`,
                            background: s.status === 'COMPLETED' ? '#10b981' : 'linear-gradient(90deg,#00d4ff,#3b82f6)',
                            transition: 'width 0.4s ease'
                          }} />
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <p>Mode: <strong style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>{s.download_mode} ({s.concurrency} workers)</strong></p>
                        <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Folder: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#00d4ff' }}>{s.destination_path}</span>
                        </p>
                        <p>Downloaded: <strong style={{ color: 'var(--text-main)' }}>{formatSize(s.downloaded_bytes)} of {formatSize(s.total_bytes)}</strong></p>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => { handleSelectSessionFilter(s.id); setActiveTab('queue'); }}
                          className="btn btn-secondary"
                          style={{ flex: 1, justifyContent: 'center', fontSize: '0.78rem', padding: '6px 10px' }}
                        >
                          View Queue
                        </button>
                        <button
                          onClick={() => handleOpenFolder(s.destination_path)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          title="Open download folder"
                        >
                          <FolderOpen size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'renumber' && <RenumberTool sessions={sessions} onRefresh={fetchDownloadItems} />}
        {activeTab === 'settings' && <SettingsModal onRefresh={fetchAuthStatus} />}
      </div>

      {showAuthModal && (
        <AuthModal
          authStatus={authStatus}
          onClose={() => setShowAuthModal(false)}
          onRefresh={() => fetchAuthStatus()}
        />
      )}

      {showSessionWizard && (
        <SessionWizard
          onClose={() => setShowSessionWizard(false)}
          onCreated={() => { fetchSessions(); fetchDownloadItems(); setActiveTab('queue'); }}
        />
      )}
    </div>
  );
};

export default App;
