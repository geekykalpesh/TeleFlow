import React, { useState, useEffect } from 'react';
import { DownloadItem, DownloadSession } from '../../types';
import {
  Download, HardDrive, Zap, Trash2, RotateCcw, Play, Pause, ExternalLink,
  AlertTriangle, RefreshCw, FolderOpen, ChevronRight, ArrowLeft,
  CheckCircle2, Clock, XCircle, Radio, Filter, Search, FolderCheck
} from 'lucide-react';

interface QueueViewProps {
  items: DownloadItem[];
  sessions: DownloadSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onClearQueue: () => void;
  onRefresh: () => void;
}

type ItemStatusFilter = 'all' | 'QUEUED' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
type SortKey = 'sequence_number' | 'original_filename' | 'total_bytes' | 'speed_bps' | 'status';
type SortDir = 'asc' | 'desc';

export const QueueView: React.FC<QueueViewProps> = ({
  items,
  sessions,
  selectedSessionId,
  onSelectSession,
  onClearQueue,
  onRefresh
}) => {
  // Local state for selected channel detail view (if not controlled from props)
  const [internalSessionId, setInternalSessionId] = useState<string | null>(selectedSessionId);
  const [itemFilter, setItemFilter] = useState<ItemStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('sequence_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // Pagination state for channel view
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50); // 25, 50, 100, 250, 0=all
  const [jumpPageInput, setJumpPageInput] = useState('');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DownloadItem } | null>(null);

  const activeSessionId = internalSessionId;
  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Shortcuts Cheat Sheet Modal State
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const visibleItems = items.filter(i => {
          if (activeSessionId && i.session_id !== activeSessionId) return false;
          if (itemFilter !== 'all' && i.status !== itemFilter) return false;
          if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            return i.original_filename.toLowerCase().includes(q) || String(i.message_id).includes(q);
          }
          return true;
        });
        setSelectedIds(new Set(visibleItems.map(i => i.id)));
      } else if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        const sel = items.filter(i => selectedIds.has(i.id));
        if (window.confirm(`Delete ${sel.length} selected item(s) from list?`)) {
          executeDelete(sel, false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIds, activeSessionId, itemFilter, searchQuery]);

  // Sync state
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null);

  const handleSyncChannel = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSyncingSessionId(sessionId);
    try {
      const res = await (window as any).electronAPI?.syncSession?.(sessionId);
      if (res && res.message) {
        console.log('[Sync]', res.message);
      }
      onRefresh();
    } catch (err) {
      console.error('Channel sync error:', err);
    } finally {
      setSyncingSessionId(null);
    }
  };

  // Sync internal session ID when prop changes
  useEffect(() => {

    setInternalSessionId(selectedSessionId);
    setCurrentPage(1);
  }, [selectedSessionId]);

  // Reset pagination on filter or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemFilter, searchQuery, pageSize, activeSessionId]);


  // Helpers
  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bps: number) => {
    if (!bps || bps === 0) return null;
    if (bps >= 1024 * 1024) return (bps / (1024 * 1024)).toFixed(2) + ' MB/s';
    return (bps / 1024).toFixed(1) + ' KB/s';
  };

  const formatEta = (remainingBytes: number, speedBps: number): string | null => {
    if (!speedBps || speedBps === 0 || !remainingBytes || remainingBytes <= 0) return null;
    const secs = Math.round(remainingBytes / speedBps);
    if (secs < 60) return `${secs}s left`;
    if (secs < 3600) return `${Math.round(secs / 60)}m left`;
    return `${(secs / 3600).toFixed(1)}h left`;
  };

  // Item Actions
  const handlePauseItem = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.pauseItem?.(id);
    onRefresh();
  };
  const handleResumeItem = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.resumeItem?.(id);
    onRefresh();
  };
  const handleRetryItem = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.retryItem?.(id);
    onRefresh();
  };
  const handleOpenPath = (p: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    (window as any).electronAPI?.openPath?.(p);
  };
  const handleOpenFolder = (p: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    (window as any).electronAPI?.openFolder?.(p);
  };

  // Selective Actions Handlers
  const handlePauseSelected = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await (window as any).electronAPI?.pauseItems?.(ids);
    onRefresh();
  };

  const handleResumeSelected = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await (window as any).electronAPI?.resumeItems?.(ids);
    onRefresh();
  };

  const handlePrioritizeSelected = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await (window as any).electronAPI?.prioritizeItems?.(ids);
    onRefresh();
  };

  const handleClearCompleted = async (sessionId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Remove all finished downloads from the queue list? (Files on disk will remain 100% safe)')) {
      await (window as any).electronAPI?.clearCompletedItems?.(sessionId);
      onRefresh();
    }
  };

  // Bulk & Context Menu Deletion Handlers
  const executeDelete = async (itemsToDelete: DownloadItem[], deleteFilesOnDisk: boolean) => {
    if (!itemsToDelete || itemsToDelete.length === 0) return;

    const ids = itemsToDelete.map(i => i.id);
    try {
      await (window as any).electronAPI?.deleteItems?.(ids, deleteFilesOnDisk);
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      onRefresh();
    } catch (err) {
      console.error('Delete items error:', err);
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, item: DownloadItem) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedIds.has(item.id)) {
      setSelectedIds(new Set([item.id]));
    }

    const mouseX = Math.min(e.clientX, window.innerWidth - 220);
    const mouseY = Math.min(e.clientY, window.innerHeight - 320);

    setContextMenu({
      x: mouseX,
      y: mouseY,
      item
    });
  };

  // Session Actions
  const handlePauseSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.pauseSession?.(sessionId);
    onRefresh();
  };

  const handleResumeSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.resumeSession?.(sessionId);
    onRefresh();
  };

  const handleRetrySession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await (window as any).electronAPI?.retrySession?.(sessionId);
    onRefresh();
  };

  const handleSelectChannel = (sessionId: string | null) => {
    setInternalSessionId(sessionId);
    onSelectSession(sessionId);
    setItemFilter('all');
    setSearchQuery('');
  };

  // Status colors
  const statusColor: Record<string, string> = {
    COMPLETED: '#10b981', DOWNLOADING: '#00d4ff', QUEUED: '#64748b', PAUSED: '#f59e0b', FAILED: '#ef4444'
  };
  const statusBg: Record<string, string> = {
    COMPLETED: 'rgba(16,185,129,0.15)', DOWNLOADING: 'rgba(0,212,255,0.12)',
    QUEUED: 'rgba(100,116,139,0.15)', PAUSED: 'rgba(245,158,11,0.15)', FAILED: 'rgba(239,68,68,0.15)'
  };

  // Global metrics
  const totalItems = items.length;
  const doneItems = items.filter(i => i.status === 'COMPLETED').length;
  const activeItems = items.filter(i => i.status === 'DOWNLOADING').length;
  const failedItems = items.filter(i => i.status === 'FAILED').length;
  const globalSpeed = items.filter(i => i.status === 'DOWNLOADING').reduce((a, i) => a + (i.speed_bps || 0), 0);

  // Active sessions with items
  const channelSessions = sessions.filter(s => items.some(i => i.session_id === s.id));

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 1: DEDICATED SINGLE CHANNEL PAGE (activeSessionId !== null)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSessionId && activeSession) {
    const sessionItems = items.filter(i => i.session_id === activeSession.id);
    const sTotal = sessionItems.length;
    const sDone = sessionItems.filter(i => i.status === 'COMPLETED').length;
    const sFailed = sessionItems.filter(i => i.status === 'FAILED').length;
    const sPaused = sessionItems.filter(i => i.status === 'PAUSED').length;
    const sDownloading = sessionItems.filter(i => i.status === 'DOWNLOADING').length;
    const sQueued = sessionItems.filter(i => i.status === 'QUEUED').length;

    const sessionSpeed = sessionItems.filter(i => i.status === 'DOWNLOADING').reduce((a, i) => a + (i.speed_bps || 0), 0);
    const sessionDownloaded = sessionItems.reduce((a, i) => a + (i.downloaded_bytes || 0), 0);
    const sessionTotal = sessionItems.reduce((a, i) => a + (i.total_bytes || 0), 0);
    const sessionRemaining = sessionTotal - sessionDownloaded;

    const pct = sessionTotal > 0 ? Math.round((sessionDownloaded / sessionTotal) * 100) : (sTotal > 0 ? Math.round((sDone / sTotal) * 100) : 0);
    const isComplete = sDone === sTotal && sTotal > 0;
    const isActive = sDownloading > 0;
    const isPaused = sPaused > 0 && sDownloading === 0 && sQueued === 0;
    const hasFailed = sFailed > 0;
    const canPause = sDownloading > 0 || sQueued > 0;
    const canResume = sPaused > 0 || hasFailed;

    const cardAccent = isComplete ? '#10b981' : isActive ? '#00d4ff' : isPaused ? '#f59e0b' : hasFailed ? '#ef4444' : '#334155';

    // Filter & sort files
    const filteredFiles = sessionItems
      .filter(i => itemFilter === 'all' || i.status === itemFilter)
      .filter(i => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          i.original_filename.toLowerCase().includes(q) ||
          String(i.message_id).includes(q) ||
          i.formatted_sequence.includes(q)
        );
      })
      .sort((a, b) => {
        const mul = sortDir === 'asc' ? 1 : -1;
        const av = (a as any)[sortKey] ?? 0;
        const bv = (b as any)[sortKey] ?? 0;
        if (typeof av === 'string') return mul * String(av).localeCompare(String(bv));
        return mul * (Number(av) - Number(bv));
      });

    const toggleSort = (key: SortKey) => {
      if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortKey(key); setSortDir('asc'); }
    };

    // Pagination calculation
    const totalFilteredCount = filteredFiles.length;
    const effectivePageSize = pageSize === 0 ? totalFilteredCount : pageSize;
    const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalFilteredCount / effectivePageSize)) : 1;
    const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const startIndex = effectivePageSize > 0 ? (validCurrentPage - 1) * effectivePageSize : 0;
    const endIndex = pageSize === 0 ? totalFilteredCount : Math.min(startIndex + pageSize, totalFilteredCount);
    const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

    const handleJumpPage = (e: React.FormEvent) => {
      e.preventDefault();
      const pageNum = parseInt(jumpPageInput, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
        setJumpPageInput('');
      }
    };


    return (
      <div style={{ padding: '18px 22px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '14px' }}>

        {/* Top Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => handleSelectChannel(null)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
              <ArrowLeft size={16} /> All Channels
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>{activeSession.title}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Quick Channel Switcher Dropdown */}
            {sessions.length > 1 && (
              <select
                value={activeSession.id}
                onChange={e => handleSelectChannel(e.target.value)}
                style={{ background: '#1a2035', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
              >
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>📡 {s.title}</option>
                ))}
              </select>
            )}

            <button onClick={onRefresh} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
              <RotateCcw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* ══ Channel Hero Banner ══ */}
        <div className="glass-panel" style={{
          padding: '18px 20px', borderRadius: '14px',
          border: `1px solid ${cardAccent}50`,
          boxShadow: isActive ? `0 0 24px ${cardAccent}20` : 'none',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                background: `linear-gradient(135deg, ${cardAccent}40, ${cardAccent}10)`,
                border: `1px solid ${cardAccent}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
              }}>
                {isComplete ? '✅' : isActive ? '⬇️' : isPaused ? '⏸️' : hasFailed ? '⚠️' : '📁'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#fff' }}>{activeSession.title}</h2>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: '20px',
                    background: isComplete ? 'rgba(16,185,129,0.2)' : isActive ? 'rgba(0,212,255,0.18)' : isPaused ? 'rgba(245,158,11,0.2)' : hasFailed ? 'rgba(239,68,68,0.18)' : 'rgba(100,116,139,0.18)',
                    color: isComplete ? '#10b981' : isActive ? '#00d4ff' : isPaused ? '#f59e0b' : hasFailed ? '#ef4444' : '#64748b'
                  }}>
                    {isComplete ? '✓ COMPLETED' : isActive ? `⬇ DOWNLOADING (${sDownloading})` : isPaused ? '⏸ PAUSED' : hasFailed ? `✗ ${sFailed} FAILED` : 'QUEUED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📡 {activeSession.chat_title}</span>
                  <span>·</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#00d4ff' }}>{activeSession.destination_path}</span>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {canPause && !isComplete && (
                <button onClick={() => handlePauseSession(activeSession.id)} className="btn"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }}>
                  <Pause size={15} /> Pause Download
                </button>
              )}
              {canResume && !isComplete && (
                <button onClick={() => handleResumeSession(activeSession.id)} className="btn btn-primary"
                  style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}>
                  <Play size={15} /> Resume Download
                </button>
              )}
              {hasFailed && (
                <button onClick={() => handleRetrySession(activeSession.id)} className="btn"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px' }}>
                  <RefreshCw size={15} /> Retry Failed ({sFailed})
                </button>
              )}
              <button onClick={e => handleSyncChannel(activeSession.id, e)} disabled={syncingSessionId === activeSession.id} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '5px' }}>
                <RefreshCw size={15} className={syncingSessionId === activeSession.id ? 'spin' : ''} /> {syncingSessionId === activeSession.id ? 'Syncing...' : 'Sync Channel'}
              </button>
              <button onClick={() => handleOpenPath(activeSession.destination_path)} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>
                <FolderOpen size={15} /> Open Folder
              </button>
              {sDone > 0 && (
                <button onClick={e => handleClearCompleted(activeSession.id, e)} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', gap: '5px', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }} title="Remove finished items from queue list (files on disk remain safe)">
                  <CheckCircle2 size={15} color="#10b981" /> Clear Completed ({sDone})
                </button>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} color="#10b981" /><strong style={{ color: '#10b981' }}>{sDone}</strong> done
                </span>
                {sDownloading > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Download size={13} color="#00d4ff" /><strong style={{ color: '#00d4ff' }}>{sDownloading}</strong> downloading
                  </span>
                )}
                {sQueued > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} color="#64748b" /><strong>{sQueued}</strong> queued
                  </span>
                )}
                {sPaused > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Pause size={13} color="#f59e0b" /><strong style={{ color: '#f59e0b' }}>{sPaused}</strong> paused
                  </span>
                )}
                {sFailed > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <XCircle size={13} color="#ef4444" /><strong style={{ color: '#ef4444' }}>{sFailed}</strong> failed
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
                {sessionSpeed > 0 && (
                  <span style={{ color: '#00d4ff', fontWeight: 700 }}>↓ {formatSpeed(sessionSpeed)}</span>
                )}
                {sessionSpeed > 0 && sessionRemaining > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>{formatEta(sessionRemaining, sessionSpeed)}</span>
                )}
                <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{formatSize(sessionDownloaded)} / {formatSize(sessionTotal)}</span>
                <span style={{ color: cardAccent, fontWeight: 800, fontSize: '0.9rem' }}>{pct}%</span>
              </div>
            </div>

            {/* Main Progress Bar */}
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: isComplete ? '#10b981' : 'linear-gradient(90deg, #00d4ff, #3b82f6)',
                borderRadius: '6px', transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        </div>

        {/* ── Search & Filter Controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Filter files by name or message ID..."
              className="input-field"
              style={{ paddingLeft: '34px', fontSize: '0.78rem', height: '34px' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Filter Pills */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {(['all', 'DOWNLOADING', 'QUEUED', 'PAUSED', 'COMPLETED', 'FAILED'] as ItemStatusFilter[]).map(f => {
              const count = f === 'all' ? sessionItems.length : sessionItems.filter(i => i.status === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setItemFilter(f)}
                  style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700,
                    background: itemFilter === f ? (statusBg[f] || '#00d4ff') : 'rgba(255,255,255,0.05)',
                    color: itemFilter === f ? (statusColor[f] || '#0c0f17') : 'var(--text-muted)',
                    border: `1px solid ${itemFilter === f ? (statusColor[f] || '#00d4ff') + '40' : 'transparent'}`
                  }}
                >
                  {f === 'all' ? `All (${count})` : `${f} (${count})`}
                </button>
              );
            })}

            {selectedIds.size > 0 && (
              <button
                onClick={() => {
                  const sel = items.filter(i => selectedIds.has(i.id));
                  if (sel.length === 0) return;
                  if (window.confirm(`Delete ${sel.length} selected file(s) from disk and remove from TeleFlow?`)) {
                    executeDelete(sel, true);
                  }
                }}
                style={{
                  padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 800,
                  background: '#ef4444', color: '#ffffff', border: 'none', display: 'flex', alignItems: 'center', gap: '4px',
                  boxShadow: '0 0 10px rgba(239,68,68,0.4)'
                }}
              >
                <Trash2 size={12} /> Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* ── Files Table Container ── */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '12px' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {paginatedFiles.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontWeight: 600 }}>No files match criteria.</p>
                <p style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.6 }}>Try changing the status filter or search query.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.25)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ width: '38px', padding: '10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={paginatedFiles.length > 0 && paginatedFiles.every(i => selectedIds.has(i.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = new Set(selectedIds);
                            paginatedFiles.forEach(i => next.add(i.id));
                            setSelectedIds(next);
                          } else {
                            const next = new Set(selectedIds);
                            paginatedFiles.forEach(i => next.delete(i.id));
                            setSelectedIds(next);
                          }
                        }}
                        style={{ cursor: 'pointer', accentColor: '#00d4ff' }}
                      />
                    </th>
                    {[
                      { label: '#', key: 'sequence_number' as SortKey, w: '60px' },
                      { label: 'FILE NAME', key: 'original_filename' as SortKey, w: undefined },
                      { label: 'TYPE', key: null, w: '80px' },
                      { label: 'PROGRESS', key: 'total_bytes' as SortKey, w: '180px' },
                      { label: 'SPEED', key: 'speed_bps' as SortKey, w: '100px' },
                      { label: 'STATUS', key: 'status' as SortKey, w: '100px' },
                      { label: 'ACTIONS', key: null, w: '160px' },
                    ].map((col, i) => (
                      <th key={i} onClick={() => col.key && toggleSort(col.key)}
                        style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.7rem', width: col.w, cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {col.label}
                          {col.key && sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedFiles.map((item: DownloadItem) => {

                    const percent = item.total_bytes > 0 ? Math.min(100, Math.round((item.downloaded_bytes / item.total_bytes) * 100)) : 0;
                    const barColor = item.status === 'COMPLETED' ? '#10b981' : item.status === 'PAUSED' ? '#f59e0b' : item.status === 'FAILED' ? '#ef4444' : 'linear-gradient(90deg,#00d4ff,#3b82f6)';
                    const isErrExpanded = expandedError === item.id;
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          onContextMenu={e => handleRowContextMenu(e, item)}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: isSelected
                              ? 'rgba(0,212,255,0.1)'
                              : item.status === 'DOWNLOADING'
                              ? 'rgba(0,212,255,0.03)'
                              : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '10px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedIds(next);
                              }}
                              style={{ cursor: 'pointer', accentColor: '#00d4ff' }}
                            />
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#00d4ff', fontSize: '0.78rem' }}>
                            {item.formatted_sequence}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <p style={{ fontWeight: 600, fontSize: '0.82rem', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                              {item.formatted_sequence}_{item.original_filename}
                            </p>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                              Msg #{item.message_id} · {formatSize(item.total_bytes)}
                            </p>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                              {item.media_type}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '3px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                              <span>{formatSize(item.downloaded_bytes)}</span>
                              <span style={{ fontWeight: 700, color: item.status === 'COMPLETED' ? '#10b981' : 'var(--text-main)' }}>{percent}%</span>
                            </div>
                            <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${percent}%`, background: barColor, transition: 'width 0.4s ease' }} />
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#00d4ff' }}>
                            {item.status === 'DOWNLOADING' ? formatSpeed(item.speed_bps) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: statusBg[item.status] || 'rgba(255,255,255,0.06)', color: statusColor[item.status] || '#fff' }}>
                              {item.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {(item.status === 'DOWNLOADING' || item.status === 'QUEUED') && (
                                <button onClick={e => handlePauseItem(item.id, e)} title="Pause"
                                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: '5px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Pause size={11} /> Pause
                                </button>
                              )}
                              {item.status === 'PAUSED' && (
                                <button onClick={e => handleResumeItem(item.id, e)} title="Resume"
                                  style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: '5px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Play size={11} /> Resume
                                </button>
                              )}
                              {item.status === 'FAILED' && (
                                <>
                                  <button onClick={e => handleRetryItem(item.id, e)} title="Retry"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', borderRadius: '5px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <RefreshCw size={11} /> Retry
                                  </button>
                                  {item.error_message && (
                                    <button onClick={e => { e.stopPropagation(); setExpandedError(isErrExpanded ? null : item.id); }} title="Error"
                                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '5px', padding: '3px 6px', fontSize: '0.7rem', cursor: 'pointer' }}>
                                      <AlertTriangle size={11} />
                                    </button>
                                  )}
                                </>
                              )}
                              {item.status === 'COMPLETED' && (
                                <>
                                  <button onClick={e => handleOpenPath(item.final_path, e)} title="Open file"
                                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', borderRadius: '5px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <ExternalLink size={11} /> Open
                                  </button>
                                  <button onClick={e => handleOpenFolder(item.final_path, e)} title="Open folder"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 6px', fontSize: '0.7rem', cursor: 'pointer' }}>
                                    <FolderOpen size={11} />
                                  </button>
                                </>
                              )}
                              {/* Trash / Delete button on every row */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (window.confirm(`Delete "${item.original_filename}" from disk and remove from TeleFlow?`)) {
                                    executeDelete([item], true);
                                  }
                                }}
                                title="Delete file or remove from list"
                                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '5px', padding: '3px 6px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isErrExpanded && item.error_message && (
                          <tr style={{ background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td colSpan={7} style={{ padding: '8px 14px 10px 70px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.76rem', color: '#f87171' }}>
                                <AlertTriangle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>{item.error_message}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Bottom Pagination Controls Bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap', gap: '10px', fontSize: '0.75rem'
          }}>
            {/* Left: Item range & Per-Page Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {totalFilteredCount === 0
                  ? '0 files'
                  : `Showing ${startIndex + 1}–${endIndex} of ${totalFilteredCount} files`}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Per page:</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  style={{
                    background: '#1a2035', border: '1px solid var(--border-color)',
                    color: 'var(--text-main)', borderRadius: '6px', padding: '3px 8px',
                    fontSize: '0.74rem', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={0}>All ({totalFilteredCount})</option>
                </select>
              </div>
            </div>

            {/* Right: Page Navigation & Direct Page Jump Input */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* First / Prev / Page Buttons / Next / Last */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={validCurrentPage === 1}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: validCurrentPage === 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-main)',
                      borderRadius: '6px', padding: '4px 8px', cursor: validCurrentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem', fontWeight: 600
                    }}
                    title="First Page"
                  >
                    « First
                  </button>

                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={validCurrentPage === 1}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: validCurrentPage === 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-main)',
                      borderRadius: '6px', padding: '4px 8px', cursor: validCurrentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem', fontWeight: 600
                    }}
                    title="Previous Page"
                  >
                    ‹ Prev
                  </button>

                  {/* Dynamic Page Pill Buttons */}
                  <div style={{ display: 'flex', gap: '3px', margin: '0 4px' }}>
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - validCurrentPage) <= 2)
                      .map((p, idx, arr) => {
                        const prevP = arr[idx - 1];
                        const showEllipsis = prevP && p - prevP > 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && <span style={{ padding: '0 2px', color: 'var(--text-muted)' }}>...</span>}
                            <button
                              onClick={() => setCurrentPage(p)}
                              style={{
                                background: p === validCurrentPage ? '#00d4ff' : 'rgba(255,255,255,0.06)',
                                border: p === validCurrentPage ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.1)',
                                color: p === validCurrentPage ? '#0c0f17' : 'var(--text-main)',
                                borderRadius: '6px', padding: '4px 9px', cursor: 'pointer',
                                fontSize: '0.72rem', fontWeight: 700
                              }}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={validCurrentPage === totalPages}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: validCurrentPage === totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text-main)',
                      borderRadius: '6px', padding: '4px 8px', cursor: validCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem', fontWeight: 600
                    }}
                    title="Next Page"
                  >
                    Next ›
                  </button>

                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={validCurrentPage === totalPages}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: validCurrentPage === totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text-main)',
                      borderRadius: '6px', padding: '4px 8px', cursor: validCurrentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.72rem', fontWeight: 600
                    }}
                    title="Last Page"
                  >
                    Last »
                  </button>
                </div>

                {/* Direct Page Jump Form */}
                <form onSubmit={handleJumpPage} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Go to:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(validCurrentPage)}
                    value={jumpPageInput}
                    onChange={e => setJumpPageInput(e.target.value)}
                    style={{
                      width: '46px', background: '#0f172a', border: '1px solid #334155',
                      borderRadius: '6px', padding: '3px 6px', color: '#fff', fontSize: '0.74rem',
                      textAlign: 'center', outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                  >
                    Jump
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 2: CHANNELS OVERVIEW PAGE (activeSessionId === null)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '18px 22px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '16px' }}>

      {/* Global Header Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {[
          { label: 'TOTAL FILES', icon: <HardDrive size={15} />, value: `${doneItems} / ${totalItems}`, sub: `${sessions.length} channel session${sessions.length !== 1 ? 's' : ''}`, color: '#fff' },
          { label: 'ACTIVE DOWNLOADS', icon: <Radio size={15} />, value: `${activeItems} downloading`, sub: `${items.filter(i => i.status === 'PAUSED').length} paused · ${items.filter(i => i.status === 'QUEUED').length} queued`, color: activeItems > 0 ? '#00d4ff' : 'var(--text-muted)' },
          { label: 'TOTAL SPEED', icon: <Zap size={15} />, value: globalSpeed > 0 ? formatSpeed(globalSpeed)! : '—', sub: 'combined across all channels', color: '#00d4ff' },
          { label: 'QUEUE HEALTH', icon: <CheckCircle2 size={15} />, value: failedItems > 0 ? `${failedItems} failed` : 'Healthy', sub: `${doneItems} completed · deterministic`, color: failedItems > 0 ? '#ef4444' : '#10b981' }
        ].map((c, i) => (
          <div key={i} className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '5px' }}>
              <span style={{ letterSpacing: '0.05em', fontWeight: 600 }}>{c.label}</span>{c.icon}
            </div>
            <p style={{ fontSize: '1.15rem', fontWeight: 700, color: c.color }}>{c.value}</p>
            <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: '2px' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Action Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={{ fontSize: '0.98rem', fontWeight: 700, flex: 1 }}>Channel Download Cards</h2>
        {doneItems > 0 && (
          <button onClick={e => handleClearCompleted(undefined, e)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }} title="Remove all completed downloads from list">
            <CheckCircle2 size={12} color="#10b981" /> Clear Completed ({doneItems})
          </button>
        )}
        {failedItems > 0 && (
          <button onClick={async () => { await (window as any).electronAPI?.retryAllFailed?.(); onRefresh(); }}
            className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem', color: '#f59e0b' }}>
            <RefreshCw size={12} /> Retry All Failed ({failedItems})
          </button>
        )}
        <button onClick={onRefresh} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem' }}>
          <RotateCcw size={12} /> Refresh
        </button>
        <button onClick={onClearQueue} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.74rem', color: '#ef4444' }}>
          <Trash2 size={12} /> Clear Queue
        </button>
      </div>

      {/* Channels Grid / List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>

        {sessions.length === 0 ? (
          <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FolderCheck size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
            <p style={{ fontSize: '0.98rem', fontWeight: 600 }}>No Channels Added Yet</p>
            <p style={{ fontSize: '0.82rem', marginTop: '4px', opacity: 0.6 }}>
              Go to <strong>Group Explorer</strong>, find a Telegram channel or group, and click "+ Add to Queue".
            </p>
          </div>
        ) : (
          sessions.map(session => {
            const sessionItems = items.filter(i => i.session_id === session.id);
            const sTotal = sessionItems.length;
            const sDone = sessionItems.filter(i => i.status === 'COMPLETED').length;
            const sFailed = sessionItems.filter(i => i.status === 'FAILED').length;
            const sPaused = sessionItems.filter(i => i.status === 'PAUSED').length;
            const sDownloading = sessionItems.filter(i => i.status === 'DOWNLOADING').length;
            const sQueued = sessionItems.filter(i => i.status === 'QUEUED').length;

            const sessionSpeed = sessionItems.filter(i => i.status === 'DOWNLOADING').reduce((a, i) => a + (i.speed_bps || 0), 0);
            const sessionDownloaded = sessionItems.reduce((a, i) => a + (i.downloaded_bytes || 0), 0);
            const sessionTotal = sessionItems.reduce((a, i) => a + (i.total_bytes || 0), 0);
            const pct = sessionTotal > 0 ? Math.round((sessionDownloaded / sessionTotal) * 100) : (sTotal > 0 ? Math.round((sDone / sTotal) * 100) : 0);

            const isComplete = sDone === sTotal && sTotal > 0;
            const isActive = sDownloading > 0;
            const isPaused = sPaused > 0 && sDownloading === 0 && sQueued === 0;
            const hasFailed = sFailed > 0;
            const canPause = sDownloading > 0 || sQueued > 0;
            const canResume = sPaused > 0 || hasFailed;

            const cardAccent = isComplete ? '#10b981' : isActive ? '#00d4ff' : isPaused ? '#f59e0b' : hasFailed ? '#ef4444' : '#334155';

            return (
              <div
                key={session.id}
                className="glass-panel"
                style={{
                  borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
                  border: `1px solid ${cardAccent}45`,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isActive ? `0 0 20px ${cardAccent}18` : 'none'
                }}
                onClick={() => handleSelectChannel(session.id)}
              >
                {/* Accent top line */}
                <div style={{ height: '3px', background: cardAccent, opacity: 0.9 }} />

                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Row 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                        background: `linear-gradient(135deg, ${cardAccent}35, ${cardAccent}10)`,
                        border: `1px solid ${cardAccent}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem'
                      }}>
                        {isComplete ? '✅' : isActive ? '⬇️' : isPaused ? '⏸️' : hasFailed ? '⚠️' : '📁'}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {session.title}
                          </h3>
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px',
                            background: isComplete ? 'rgba(16,185,129,0.2)' : isActive ? 'rgba(0,212,255,0.18)' : isPaused ? 'rgba(245,158,11,0.2)' : hasFailed ? 'rgba(239,68,68,0.18)' : 'rgba(100,116,139,0.18)',
                            color: isComplete ? '#10b981' : isActive ? '#00d4ff' : isPaused ? '#f59e0b' : hasFailed ? '#ef4444' : '#64748b'
                          }}>
                            {isComplete ? '✓ COMPLETED' : isActive ? `⬇ DOWNLOADING (${sDownloading})` : isPaused ? '⏸ PAUSED' : hasFailed ? `✗ ${sFailed} FAILED` : 'QUEUED'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📡 {session.chat_title} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#00d4ff' }}>{session.destination_path}</span>
                        </p>
                      </div>
                    </div>

                    {/* Action buttons + Open Page trigger */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {canPause && !isComplete && (
                        <button onClick={e => handlePauseSession(session.id, e)}
                          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Pause size={13} /> Pause
                        </button>
                      )}
                      {canResume && !isComplete && (
                        <button onClick={e => handleResumeSession(session.id, e)}
                          style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.35)', color: '#00d4ff', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Play size={13} /> Resume
                        </button>
                      )}
                      {hasFailed && (
                        <button onClick={e => handleRetrySession(session.id, e)}
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <RefreshCw size={13} /> Retry ({sFailed})
                        </button>
                      )}
                      <button onClick={e => handleSyncChannel(session.id, e)} disabled={syncingSessionId === session.id}
                        style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff', borderRadius: '8px', padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={13} className={syncingSessionId === session.id ? 'spin' : ''} /> {syncingSessionId === session.id ? 'Syncing...' : 'Sync'}
                      </button>

                      {/* Prominent Open Channel Page button */}
                      <button onClick={e => { e.stopPropagation(); handleSelectChannel(session.id); }} className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700 }}>
                        Open Channel Page <ChevronRight size={14} />
                      </button>

                    </div>
                  </div>

                  {/* Row 2: Progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', gap: '14px', color: 'var(--text-muted)' }}>
                        <span><strong style={{ color: '#10b981' }}>{sDone}</strong> done</span>
                        {sDownloading > 0 && <span><strong style={{ color: '#00d4ff' }}>{sDownloading}</strong> active</span>}
                        {sQueued > 0 && <span><strong>{sQueued}</strong> queued</span>}
                        {sPaused > 0 && <span><strong style={{ color: '#f59e0b' }}>{sPaused}</strong> paused</span>}
                        {sFailed > 0 && <span><strong style={{ color: '#ef4444' }}>{sFailed}</strong> failed</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontFamily: 'var(--font-mono)' }}>
                        {sessionSpeed > 0 && <span style={{ color: '#00d4ff', fontWeight: 700 }}>↓ {formatSpeed(sessionSpeed)}</span>}
                        <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{formatSize(sessionDownloaded)} / {formatSize(sessionTotal)}</span>
                        <span style={{ fontWeight: 800, color: cardAccent }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cardAccent, borderRadius: '6px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Floating Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9000,
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(0, 212, 255, 0.4)',
          borderRadius: '12px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, color: '#00d4ff', fontSize: '0.85rem' }}>
              {selectedIds.size} file(s) selected
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({formatSize(items.filter(i => selectedIds.has(i.id)).reduce((a, b) => a + (b.total_bytes || 0), 0))})
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={handlePauseSelected}
              className="btn"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '5px 12px', fontSize: '0.78rem', gap: '4px' }}
              title="Pause only the selected files"
            >
              <Pause size={13} /> Pause Selected
            </button>
            <button
              onClick={handleResumeSelected}
              className="btn btn-primary"
              style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '4px' }}
              title="Resume downloading selected files"
            >
              <Play size={13} /> Resume Selected
            </button>
            <button
              onClick={handlePrioritizeSelected}
              className="btn"
              style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)', padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, gap: '4px' }}
              title="Move selected files to the top of the queue to download first"
            >
              <Zap size={13} /> Download Selected First
            </button>
            <button
              onClick={() => {
                const sel = items.filter(i => selectedIds.has(i.id));
                for (const item of sel) handleRetryItem(item.id);
              }}
              className="btn"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '5px 12px', fontSize: '0.78rem', gap: '4px' }}
            >
              <RefreshCw size={13} /> Retry
            </button>
            <button
              onClick={() => {
                const sel = items.filter(i => selectedIds.has(i.id));
                if (sel.length > 0 && window.confirm(`Remove ${sel.length} selected item(s) from list (keep files on disk)?`)) {
                  executeDelete(sel, false);
                }
              }}
              className="btn btn-secondary"
              style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '4px' }}
            >
              <Trash2 size={13} /> Remove from List
            </button>
            <button
              onClick={() => {
                const sel = items.filter(i => selectedIds.has(i.id));
                if (sel.length > 0 && window.confirm(`Permanently delete ${sel.length} selected file(s) from disk and remove from TeleFlow?`)) {
                  executeDelete(sel, true);
                }
              }}
              className="btn"
              style={{ background: '#ef4444', color: '#fff', padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700, gap: '4px' }}
            >
              <XCircle size={13} /> Delete Files from Disk
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '6px', fontSize: '0.75rem', fontWeight: 600 }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* ── Right-Click Context Menu ── */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            padding: '6px',
            minWidth: '200px',
            fontSize: '0.81rem'
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.item.status === 'COMPLETED' && (
            <button
              onClick={() => {
                const target = contextMenu.item.final_path || contextMenu.item.temp_path;
                if (target) handleOpenPath(target);
                setContextMenu(null);
              }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
            >
              <ExternalLink size={14} color="#10b981" /> Open File
            </button>
          )}

          <button
            onClick={() => {
              const target = contextMenu.item.final_path || contextMenu.item.temp_path || activeSession?.destination_path;
              if (target) handleOpenFolder(target);
              setContextMenu(null);
            }}
            style={{ width: '100%', background: 'none', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
          >
            <FolderOpen size={14} color="#00d4ff" /> Show in Folder
          </button>

          <div style={{ height: '1px', background: '#334155', margin: '4px 0' }} />

          {(contextMenu.item.status === 'QUEUED' || contextMenu.item.status === 'PAUSED' || contextMenu.item.status === 'FAILED') && (
            <button
              onClick={() => {
                const targetIds = selectedIds.size > 0 && selectedIds.has(contextMenu.item.id)
                  ? Array.from(selectedIds)
                  : [contextMenu.item.id];
                (window as any).electronAPI?.prioritizeItems?.(targetIds);
                setContextMenu(null);
                onRefresh();
              }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#c084fc', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', fontWeight: 600 }}
            >
              <Zap size={14} color="#c084fc" /> Download First (Prioritize)
            </button>
          )}

          {(contextMenu.item.status === 'DOWNLOADING' || contextMenu.item.status === 'QUEUED') && (
            <button
              onClick={() => {
                const targetIds = selectedIds.size > 0 && selectedIds.has(contextMenu.item.id)
                  ? Array.from(selectedIds)
                  : [contextMenu.item.id];
                if (targetIds.length > 1) handlePauseSelected();
                else handlePauseItem(contextMenu.item.id);
                setContextMenu(null);
              }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#f59e0b', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
            >
              <Pause size={14} /> Pause Download
            </button>
          )}

          {(contextMenu.item.status === 'PAUSED' || contextMenu.item.status === 'FAILED') && (
            <button
              onClick={() => {
                const targetIds = selectedIds.size > 0 && selectedIds.has(contextMenu.item.id)
                  ? Array.from(selectedIds)
                  : [contextMenu.item.id];
                if (targetIds.length > 1) handleResumeSelected();
                else handleResumeItem(contextMenu.item.id);
                setContextMenu(null);
              }}
              style={{ width: '100%', background: 'none', border: 'none', color: '#00d4ff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
            >
              <Play size={14} /> Resume Download
            </button>
          )}

          <div style={{ height: '1px', background: '#334155', margin: '4px 0' }} />

          <button
            onClick={() => {
              const selectedList = items.filter(i => selectedIds.has(i.id));
              const targetList = selectedList.length > 0 ? selectedList : [contextMenu.item];
              setContextMenu(null);
              if (window.confirm(`Remove ${targetList.length} item(s) from list (keep files on disk)?`)) {
                executeDelete(targetList, false);
              }
            }}
            style={{ width: '100%', background: 'none', border: 'none', color: '#f87171', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
          >
            <Trash2 size={14} color="#f87171" /> Remove from List
          </button>

          <button
            onClick={() => {
              const selectedList = items.filter(i => selectedIds.has(i.id));
              const targetList = selectedList.length > 0 ? selectedList : [contextMenu.item];
              setContextMenu(null);
              if (window.confirm(`Permanently delete ${targetList.length} file(s) from disk and remove from TeleFlow?`)) {
                executeDelete(targetList, true);
              }
            }}
            style={{ width: '100%', background: 'none', border: 'none', color: '#ef4444', fontWeight: 700, padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
          >
            <XCircle size={14} color="#ef4444" /> Delete File & Remove
          </button>
        </div>
      )}

      {/* ── Keyboard Shortcuts Cheat Sheet Modal ── */}
      {showShortcutsModal && (
        <div className="modal-overlay" onClick={() => setShowShortcutsModal(false)} style={{ zIndex: 99999 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcutsModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Select All Items in View</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#00d4ff', fontFamily: 'monospace' }}>Ctrl + A</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Delete Selected Items</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#f87171', fontFamily: 'monospace' }}>Delete</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Start / Pause Entire Queue</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#f59e0b', fontFamily: 'monospace' }}>Ctrl + P</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Refresh Sessions & Items</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#10b981', fontFamily: 'monospace' }}>Ctrl + R</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Open Application Settings</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#c084fc', fontFamily: 'monospace' }}>Ctrl + ,</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Toggle Shortcuts Cheat Sheet</span>
                <kbd style={{ background: '#1e293b', border: '1px solid #475569', padding: '2px 8px', borderRadius: '4px', color: '#fff', fontFamily: 'monospace' }}>Shift + ?</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
