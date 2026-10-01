import React from 'react';
import { DownloadSession, TelegramAuthStatus } from '../../types';
import { Download, Layers, RefreshCw, Settings, ShieldCheck, User, FolderCheck, Play, Pause, Search } from 'lucide-react';

interface SidebarProps {
  activeTab: 'queue' | 'explorer' | 'sessions' | 'renumber' | 'settings';
  setActiveTab: (tab: 'queue' | 'explorer' | 'sessions' | 'renumber' | 'settings') => void;
  authStatus: TelegramAuthStatus;
  onOpenAuth: () => void;
  onOpenNewSession: () => void;
  sessions: DownloadSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  isQueueRunning: boolean;
  onToggleQueue: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  authStatus,
  onOpenAuth,
  onOpenNewSession,
  sessions,
  selectedSessionId,
  onSelectSession,
  isQueueRunning,
  onToggleQueue
}) => {
  return (
    <aside style={{
      width: '260px',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      padding: '16px'
    }}>
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 4px', marginBottom: '24px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '4px',
          background: 'var(--accent-blue)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: 'none'
        }}>
          <Download size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
            TeleFlow
          </h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Deterministic Downloader</p>
        </div>
      </div>

      {/* Primary CTA (Placed at top for F-Pattern Scanning) */}
      <button
        onClick={onOpenNewSession}
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', marginBottom: '24px' }}
      >
        <Download size={16} /> New Download Session
      </button>

      {/* Main Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 'auto' }}>
        <button
          className="nav-btn"
          onClick={() => setActiveTab('queue')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: activeTab === 'queue' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'queue' ? 'var(--text-main)' : 'var(--text-muted)',
            border: '1px solid transparent',
            fontWeight: activeTab === 'queue' ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
        >
          <Layers size={18} />
          <span style={{ flex: 1 }}>Download Queue</span>
        </button>

        <button
          className="nav-btn"
          onClick={() => setActiveTab('explorer')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: activeTab === 'explorer' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'explorer' ? 'var(--text-main)' : 'var(--text-muted)',
            border: '1px solid transparent',
            fontWeight: activeTab === 'explorer' ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
        >
          <Search size={18} />
          <span style={{ flex: 1 }}>Group Explorer</span>
        </button>

        <button
          className="nav-btn"
          onClick={() => setActiveTab('sessions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: activeTab === 'sessions' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'sessions' ? 'var(--text-main)' : 'var(--text-muted)',
            border: '1px solid transparent',
            fontWeight: activeTab === 'sessions' ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
        >
          <FolderCheck size={18} />
          <span style={{ flex: 1 }}>Sessions</span>
          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '10px' }}>
            {sessions.length}
          </span>
        </button>

        <button
          className="nav-btn"
          onClick={() => setActiveTab('renumber')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: activeTab === 'renumber' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'renumber' ? 'var(--text-main)' : 'var(--text-muted)',
            border: '1px solid transparent',
            fontWeight: activeTab === 'renumber' ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
        >
          <RefreshCw size={18} />
          <span style={{ flex: 1 }}>Renumber Utility</span>
        </button>

        <button
          className="nav-btn"
          onClick={() => setActiveTab('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: activeTab === 'settings' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--text-main)' : 'var(--text-muted)',
            border: '1px solid transparent',
            fontWeight: activeTab === 'settings' ? 600 : 400,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
        >
          <Settings size={18} />
          <span style={{ flex: 1 }}>Settings</span>
        </button>
      </nav>

      {/* Global Queue Control */}
      <button
        onClick={onToggleQueue}
        className={`btn ${isQueueRunning ? 'btn-secondary' : 'btn-primary'}`}
        style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', marginBottom: '16px' }}
      >
        {isQueueRunning ? <><Pause size={16} /> Pause Queue</> : <><Play size={16} /> Start Queue</>}
      </button>

      {/* Account Info Footer */}
      <div style={{
        marginTop: 'auto',
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: authStatus.isAuthenticated ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: authStatus.isAuthenticated ? 'var(--accent-green)' : 'var(--accent-red)'
          }}>
            {authStatus.isAuthenticated ? <ShieldCheck size={18} /> : <User size={18} />}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authStatus.isAuthenticated ? (authStatus.user?.firstName || 'Connected') : 'Disconnected'}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {authStatus.isAuthenticated ? (authStatus.user?.phone || 'Telegram Account') : 'Click to Login'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenAuth}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-cyan)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {authStatus.isAuthenticated ? 'Edit' : 'Login'}
        </button>
      </div>

      {/* Credits Footer */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid var(--border-color)',
        textAlign: 'center'
      }}>
        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
          Made with <span style={{ color: 'var(--accent-red)' }}>♥</span> by <strong style={{ color: 'var(--text-main)' }}>Kalpesh Mahajan</strong>
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '0.65rem' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); (window as any).electronAPI.openExternal('https://geekykalpesh.com'); }} style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>geekykalpesh.com</a>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <a href="#" onClick={(e) => { e.preventDefault(); (window as any).electronAPI.openExternal('mailto:geekykalpesh@gmail.com'); }} style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}>geekykalpesh@gmail.com</a>
        </div>
      </div>
    </aside>
  );
};
