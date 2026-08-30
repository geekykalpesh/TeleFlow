import React, { useState, useEffect } from 'react';
import { TelegramChat, GroupMessageItem, ScanOptions, MediaType } from '../../types';
import {
  Search, FolderOpen, ArrowLeft, PlusCircle, CheckSquare, Square,
  FileText, Video, Music, Image as ImageIcon, FolderPlus, Settings2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader, AlertTriangle, Download, Link
} from 'lucide-react';

interface ChannelExplorerProps {
  onSessionCreated: () => void;
}

const PAGE_SIZE = 100;
const MEDIA_TYPES: MediaType[] = ['video', 'audio', 'photo', 'document', 'text', 'link'];

const TypeIcon: React.FC<{ type: MediaType }> = ({ type }) => {
  switch (type) {
    case 'video': return <Video size={14} color="#3b82f6" />;
    case 'audio': case 'voice': return <Music size={14} color="#ec4899" />;
    case 'photo': return <ImageIcon size={14} color="#10b981" />;
    case 'document': return <FileText size={14} color="#f59e0b" />;
    case 'link': return <Link size={14} color="#00d4ff" />;
    case 'text': default: return <FileText size={14} color="#a855f7" />;
  }
};

export const ChannelExplorer: React.FC<ChannelExplorerProps> = ({ onSessionCreated }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<TelegramChat | null>(null);

  // ALL loaded messages (accumulates across pages)
  const [allMessages, setAllMessages] = useState<GroupMessageItem[]>([]);
  // For pagination: oldest message ID seen so far (used as offsetId for next fetch)
  const [oldestMsgId, setOldestMsgId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);   // which page of allMessages to VIEW
  const totalPages = Math.max(1, Math.ceil(allMessages.length / PAGE_SIZE));

  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());
  const [customDestination, setCustomDestination] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced scan options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromMsgId, setFromMsgId] = useState('');
  const [toMsgId, setToMsgId] = useState('');
  const [typeFilter, setTypeFilter] = useState<MediaType[]>([]);

  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [scanProgressText, setScanProgressText] = useState('');
  const stopAutoLoadRef = React.useRef(false);

  const getApi = () => {


    const api = (window as any).electronAPI;
    if (!api) throw new Error('Electron API not initialized. Run TeleFlow Desktop.');
    return api;
  };

  useEffect(() => { handleSearch(''); }, []);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const res = await api.searchChats(query);
      setChats(res || []);
    } catch (err: any) {
      setError(err.message || 'Failed to search Telegram chats');
    } finally {
      setLoading(false);
    }
  };

  const [forumTopics, setForumTopics] = useState<any[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<number | undefined>(undefined);

  // Auto-scan ALL messages in a channel or topic thread
  const handleGoInsideGroup = async (chat: TelegramChat, targetTopicId?: number) => {
    setSelectedChat(chat);
    setActiveTopicId(targetTopicId);
    setLoading(true);
    setError(null);
    setAllMessages([]);
    setSelectedMsgIds(new Set());
    setOldestMsgId(null);
    setHasMore(false);
    setCurrentPage(1);
    setCustomDestination('');
    stopAutoLoadRef.current = false;
    setIsAutoLoading(true);

    try {
      const api = getApi();

      // Fetch forum topics if group/forum
      if (!targetTopicId) {
        try {
          const tRes = await api.getForumTopics(chat.id);
          setForumTopics(tRes || []);
        } catch (e) {
          setForumTopics([]);
        }
      }

      const from = fromMsgId ? parseInt(fromMsgId, 10) : undefined;
      const to = toMsgId ? parseInt(toMsgId, 10) : undefined;

      let accumulatedItems: GroupMessageItem[] = [];
      let currentOffsetId: number | undefined = undefined;
      let keepFetching = true;
      let pageCount = 0;

      while (keepFetching && !stopAutoLoadRef.current) {
        pageCount++;
        setScanProgressText(`Auto-scanning channel history... (${accumulatedItems.length} media files found across ${pageCount * 100} messages)`);

        const result: { items: GroupMessageItem[]; hasMore: boolean; oldestMsgId: number | null } =
          await api.inspectGroupMessages(chat.id, PAGE_SIZE, from, to, currentOffsetId, targetTopicId);
        const { items, hasMore: more, oldestMsgId: oldest } = result;

        if (items && items.length > 0) {
          const map = new Map(accumulatedItems.map(m => [m.message_id, m]));
          items.forEach((m: GroupMessageItem) => map.set(m.message_id, m));
          accumulatedItems = Array.from(map.values()).sort((a, b) => a.message_id - b.message_id);

          setAllMessages([...accumulatedItems]);
          setSelectedMsgIds(new Set(accumulatedItems.map(m => m.message_id)));
        }

        if (!more || oldest === null || oldest === currentOffsetId) {
          keepFetching = false;
        } else {
          currentOffsetId = oldest;
        }

        if (pageCount === 1) {
          setLoading(false);
        }
      }

      setOldestMsgId(currentOffsetId ?? null);
      setHasMore(false);

    } catch (err: any) {
      setError(err.message || 'Failed to fetch group media stream');
    } finally {
      setLoading(false);
      setIsAutoLoading(false);
      setScanProgressText('');
    }
  };

  const handleStopAutoLoad = () => {
    stopAutoLoadRef.current = true;
    setIsAutoLoading(false);
  };

  // Load the next page (manual backup)
  const handleLoadMore = async () => {
    if (!selectedChat || loadingMore || oldestMsgId === null) return;
    setLoadingMore(true);
    setError(null);

    try {
      const api = getApi();
      const from = fromMsgId ? parseInt(fromMsgId, 10) : undefined;
      const to = toMsgId ? parseInt(toMsgId, 10) : undefined;
      const result = await api.inspectGroupMessages(selectedChat.id, PAGE_SIZE, from, to, oldestMsgId);
      const { items, hasMore: more, oldestMsgId: oldest } = result;

      if (items && items.length > 0) {
        setAllMessages(prev => {
          const combined = [...prev, ...items];
          const unique = Array.from(new Map(combined.map(m => [m.message_id, m])).values());
          unique.sort((a, b) => a.message_id - b.message_id);
          return unique;
        });
        setSelectedMsgIds(prev => {
          const next = new Set(prev);
          items.forEach((m: GroupMessageItem) => next.add(m.message_id));
          return next;
        });
      }

      setHasMore(more);
      setOldestMsgId(oldest);
    } catch (err: any) {
      setError(err.message || 'Failed to load more messages');
    } finally {
      setLoadingMore(false);
    }
  };


  const handleChooseFolder = async () => {
    try {
      const api = getApi();
      const folderPath = await api.selectDirectory();
      if (folderPath) setCustomDestination(folderPath);
    } catch (err: any) { console.error('Folder selection failed:', err); }
  };

  // Visible messages on the current page
  const visibleMessages = (() => {
    let src = allMessages;
    if (typeFilter.length > 0) src = src.filter(m => typeFilter.includes(m.media_type));
    const start = (currentPage - 1) * PAGE_SIZE;
    return src.slice(start, start + PAGE_SIZE);
  })();

  const filteredAll = typeFilter.length > 0 ? allMessages.filter(m => typeFilter.includes(m.media_type)) : allMessages;
  const filteredTotalPages = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE));

  const toggleSelectMessage = (msgId: number) => {
    setSelectedMsgIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const toggleSelectPage = () => {
    const pageIds = visibleMessages.map(m => m.message_id);
    const allSelected = pageIds.every(id => selectedMsgIds.has(id));
    setSelectedMsgIds(prev => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMsgIds(new Set(allMessages.map(m => m.message_id)));
  };

  const deselectAll = () => setSelectedMsgIds(new Set());

  const toggleTypeFilter = (t: MediaType) => {
    setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setCurrentPage(1);
  };

  const handleAddSelectedToQueue = async () => {
    if (!selectedChat || selectedMsgIds.size === 0) return;

    let targetFolder = customDestination;
    if (!targetFolder) {
      try {
        const api = getApi();
        const picked = await api.selectDirectory();
        if (picked) { targetFolder = picked; setCustomDestination(picked); }
      } catch (e) {}
    }

    setAddingToQueue(true);
    setError(null);

    const options: ScanOptions = {
      chat_id: selectedChat.id,
      chat_title: selectedChat.title,
      limit: PAGE_SIZE,
      from_message_id: fromMsgId ? parseInt(fromMsgId, 10) : undefined,
      to_message_id: toMsgId ? parseInt(toMsgId, 10) : undefined,
      selected_message_ids: Array.from(selectedMsgIds),
      media_types: typeFilter.length > 0 ? typeFilter : undefined,
      destination_path: targetFolder || undefined,
      session_title: `${selectedChat.title}`
    };

    try {
      const api = getApi();
      await api.scanAndEnqueue(options);
      await api.startQueue();
      onSessionCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to add items to queue');
      setAddingToQueue(false);
    }
  };

  const handleEnqueueAllTopics = async () => {
    if (!selectedChat) return;

    let targetFolder = customDestination;
    if (!targetFolder) {
      try {
        const api = getApi();
        const picked = await api.selectDirectory();
        if (picked) { targetFolder = picked; setCustomDestination(picked); }
      } catch (e) {}
    }

    setAddingToQueue(true);
    setError(null);

    const options: ScanOptions = {
      chat_id: selectedChat.id,
      chat_title: selectedChat.title,
      destination_path: targetFolder || undefined,
      session_title: `${selectedChat.title}`
    };

    try {
      const api = getApi();
      await api.scanAllTopics(options);
      await api.startQueue();
      onSessionCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to enqueue all topics');
      setAddingToQueue(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '—';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSelectedSize = allMessages
    .filter(m => selectedMsgIds.has(m.message_id))
    .reduce((acc, m) => acc + m.size, 0);

  const typeCounts = MEDIA_TYPES.reduce((acc, t) => {
    acc[t] = allMessages.filter(m => m.media_type === t).length;
    return acc;
  }, {} as Record<string, number>);

  const TypeIcon = ({ type }: { type: string }) => {
    switch (type) {
      case 'video': return <Video size={14} color="#00d4ff" />;
      case 'audio': return <Music size={14} color="#a78bfa" />;
      case 'photo': return <ImageIcon size={14} color="#10b981" />;
      default: return <FileText size={14} color="#f59e0b" />;
    }
  };

  const pageAllSelected = visibleMessages.length > 0 && visibleMessages.every(m => selectedMsgIds.has(m.message_id));

  return (
    <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '2px' }}>
            {selectedChat ? `📂 ${selectedChat.title}` : 'Telegram Group & Channel Explorer'}
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {selectedChat
              ? `${allMessages.length} media items loaded${hasMore ? ' · more available →' : ' · all loaded'}. Select what to download.`
              : 'Search your Telegram groups or channels and browse their media files.'}
          </p>
        </div>
        {selectedChat && (
          <button onClick={() => { setSelectedChat(null); setAllMessages([]); setSelectedMsgIds(new Set()); setForumTopics([]); setActiveTopicId(undefined); }} className="btn btn-secondary">
            <ArrowLeft size={15} /> Back to Search
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* ══ SEARCH VIEW ══ */}
      {!selectedChat && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>

          {/* Advanced Panel */}
          <div className="glass-panel" style={{ padding: '12px 16px' }}>
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
              <Settings2 size={14} /> Message Range & Link Options {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginTop: '12px' }}>
                {[
                  { label: 'From Link / Message ID', val: fromMsgId, set: setFromMsgId, ph: 'e.g. https://t.me/c/3429930878/642 or 642' },
                  { label: 'To Link / Message ID', val: toMsgId, set: setToMsgId, ph: 'e.g. https://t.me/c/3429930878/750 or 750' },
                ].map((f, i) => (
                  <div key={i}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input type="text" placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)}
                      className="input-field" style={{ fontSize: '0.75rem', padding: '6px 10px' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input type="text" placeholder="Search groups or channels by name or @username..." className="input-field" style={{ paddingLeft: '38px' }}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch(searchQuery)} />
            </div>
            <button onClick={() => handleSearch(searchQuery)} className="btn btn-primary" disabled={loading} style={{ minWidth: '90px' }}>
              {loading ? <><Loader size={14} className="spin" /> Searching...</> : <><Search size={14} /> Search</>}
            </button>
          </div>

          {/* Chat List */}
          <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '14px', borderRadius: '12px' }}>
            {chats.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Search size={40} style={{ opacity: 0.25, marginBottom: '10px' }} />
                <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Search for a channel or group</p>
                <p style={{ fontSize: '0.78rem', marginTop: '4px', opacity: 0.7 }}>Type a name above and hit Enter, or use @username</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px,1fr))', gap: '12px' }}>
                {chats.map((chat) => (
                  <div key={chat.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(0,212,255,0.12)', color: '#00d4ff', textTransform: 'uppercase' }}>
                          {chat.type}
                        </span>
                        {chat.isForum && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(168,85,247,0.18)', color: '#c084fc', textTransform: 'uppercase' }}>
                            FORUM
                          </span>
                        )}
                        {chat.username && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '4px' }}>@{chat.username}</span>}
                      </div>
                      {chat.participantsCount ? <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{chat.participantsCount.toLocaleString()} members</span> : null}
                    </div>
                    <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '10px' }}>{chat.title}</h3>
                    <button onClick={() => handleGoInsideGroup(chat)} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '7px', fontSize: '0.8rem' }}>
                      <FolderOpen size={14} /> Open & Browse Media
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MEDIA STREAM VIEW ══ */}
      {selectedChat && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>

          {/* ── Forum Topics Bar ── */}
          {forumTopics.length > 0 && (
            <div style={{ background: 'rgba(0, 212, 255, 0.07)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '10px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00d4ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  💬 FORUM TOPICS ({forumTopics.length})
                </span>
                <button onClick={handleEnqueueAllTopics} className="btn btn-primary" disabled={addingToQueue} style={{ padding: '4px 12px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                  <FolderPlus size={13} /> Enqueue All Topics (Auto Create Subfolders)
                </button>
              </div>

              {/* Topic pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '90px', overflowY: 'auto' }}>
                <button
                  onClick={() => handleGoInsideGroup(selectedChat)}
                  style={{
                    padding: '3px 10px', borderRadius: '16px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600,
                    background: activeTopicId === undefined ? '#00d4ff' : 'rgba(255,255,255,0.08)',
                    color: activeTopicId === undefined ? '#0c0f17' : 'var(--text-main)', border: 'none'
                  }}
                >
                  🌐 All Messages
                </button>
                {forumTopics.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleGoInsideGroup(selectedChat, t.id)}
                    style={{
                      padding: '3px 10px', borderRadius: '16px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600,
                      background: activeTopicId === t.id ? '#00d4ff' : 'rgba(255,255,255,0.08)',
                      color: activeTopicId === t.id ? '#0c0f17' : 'var(--text-main)', border: 'none'
                    }}
                  >
                    💬 {t.title} {t.messagesCount ? `(${t.messagesCount})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Top Action Bar ── */}
          <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

            {/* Folder picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
              <FolderPlus size={15} color="#00d4ff" />
              <input type="text" readOnly placeholder="Pick download folder (or uses default)..."
                value={customDestination} className="input-field"
                style={{ flex: 1, fontSize: '0.73rem', fontFamily: 'var(--font-mono)', padding: '5px 10px' }} />
              <button onClick={handleChooseFolder} className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
                <FolderOpen size={13} /> Browse
              </button>
            </div>

            {/* Media type chips */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {MEDIA_TYPES.map(t => (
                <button key={t} onClick={() => toggleTypeFilter(t)} style={{
                  padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 700, textTransform: 'capitalize',
                  background: typeFilter.includes(t) ? '#00d4ff' : 'rgba(255,255,255,0.07)',
                  color: typeFilter.includes(t) ? '#0c0f17' : 'var(--text-muted)', border: 'none'
                }}>
                  {t} {typeCounts[t] > 0 ? `(${typeCounts[t]})` : ''}
                </button>
              ))}
            </div>

            {/* Add to queue */}
            <button onClick={handleAddSelectedToQueue} className="btn btn-primary" disabled={addingToQueue || selectedMsgIds.size === 0}
              style={{ padding: '7px 16px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              {addingToQueue
                ? <><Loader size={14} /> Adding...</>
                : <><Download size={14} /> Download {selectedMsgIds.size} files ({formatSize(totalSelectedSize)})</>}
            </button>
          </div>

          {/* ── Selection controls + pagination ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Select controls */}
            <button onClick={toggleSelectPage} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
              {pageAllSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {pageAllSelected ? 'Deselect Page' : 'Select Page'}
            </button>
            <button onClick={selectAll} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#00d4ff' }}>
              <CheckSquare size={13} /> Select All Loaded ({allMessages.length})
            </button>
            <button onClick={deselectAll} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#ef4444' }}>
              <Square size={13} /> Deselect All
            </button>

            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
              {selectedMsgIds.size} selected · {formatSize(totalSelectedSize)}
            </span>

            {/* Pagination */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {hasMore && (
                <button onClick={handleLoadMore} disabled={loadingMore} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                  {loadingMore ? <><Loader size={12} /> Loading...</> : `⬇ Load More (next ${PAGE_SIZE})`}
                </button>
              )}
              {!hasMore && allMessages.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>✓ All messages loaded</span>
              )}
              {filteredTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 7px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', minWidth: '80px', textAlign: 'center' }}>
                    Page {currentPage} / {filteredTotalPages}
                  </span>
                  <button onClick={() => setCurrentPage(p => Math.min(filteredTotalPages, p + 1))} disabled={currentPage === filteredTotalPages}
                    style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 7px', cursor: currentPage === filteredTotalPages ? 'not-allowed' : 'pointer', opacity: currentPage === filteredTotalPages ? 0.4 : 1 }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Media Table ── */}
          <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', borderRadius: '12px' }}>
            {loading ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <p style={{ fontWeight: 600 }}>Loading media from <strong>{selectedChat.title}</strong>...</p>
                <p style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.7 }}>Fetching first {PAGE_SIZE} messages</p>
              </div>
            ) : visibleMessages.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontWeight: 600 }}>No media found on this page.</p>
                <p style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.7 }}>
                  {hasMore ? 'Click "Load More" to fetch older messages.' : 'Try changing the type filter.'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.25)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {[
                      { label: '', w: '44px' },
                      { label: 'MSG ID', w: '90px' },
                      { label: 'FILENAME', w: undefined },
                      { label: 'TYPE', w: '80px' },
                      { label: 'SIZE', w: '90px' },
                      { label: 'SENDER', w: '120px' },
                      { label: 'DATE', w: '90px' },
                    ].map((col, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.04em', fontSize: '0.7rem', width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleMessages.map((msg) => {
                    const isSelected = selectedMsgIds.has(msg.message_id);
                    return (
                      <tr key={msg.message_id} onClick={() => toggleSelectMessage(msg.message_id)}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isSelected ? 'rgba(0,212,255,0.05)' : 'transparent', transition: 'background 0.12s' }}>
                        <td style={{ padding: '9px 12px' }}>
                          {isSelected
                            ? <CheckSquare size={15} color="#00d4ff" />
                            : <Square size={15} color="rgba(255,255,255,0.2)" />}
                        </td>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#00d4ff', fontSize: '0.75rem' }}>
                          #{msg.message_id}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.filename}
                          {msg.text && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>{msg.text.slice(0, 40)}</span>}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <TypeIcon type={msg.media_type} />
                            <span style={{ fontSize: '0.7rem', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{msg.media_type}</span>
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{formatSize(msg.size)}</td>
                        <td style={{ padding: '9px 12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{msg.sender_name}</td>
                        <td style={{ padding: '9px 12px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>{msg.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Bottom Auto-Scan Status Bar ── */}
          {isAutoLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
              padding: '10px 16px', background: 'rgba(0,212,255,0.08)', borderTop: '1px solid rgba(0,212,255,0.3)',
              borderRadius: '0 0 12px 12px'
            }}>
              <Loader size={16} className="spin" color="#00d4ff" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#00d4ff' }}>
                {scanProgressText || 'Auto-scanning entire channel history...'}
              </span>
              <button onClick={handleStopAutoLoad} className="btn btn-secondary"
                style={{ padding: '4px 12px', fontSize: '0.76rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                Stop Scanning & Keep Loaded
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
