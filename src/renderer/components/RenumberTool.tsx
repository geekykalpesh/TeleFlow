import React, { useState } from 'react';
import { DownloadSession, DownloadItem } from '../../types';
import { RefreshCw, CheckCircle2, AlertCircle, ListOrdered, ArrowRight } from 'lucide-react';

interface RenumberToolProps {
  sessions: DownloadSession[];
  onRefresh: () => void;
}

export const RenumberTool: React.FC<RenumberToolProps> = ({ sessions, onRefresh }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(sessions[0]?.id || '');
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadItems = async (sessionId: string) => {
    if (!sessionId) return;
    setSelectedSessionId(sessionId);
    setLoading(true);
    try {
      const res = await (window as any).electronAPI.getDownloadItems(sessionId);
      setItems(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteRenumber = async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setSuccessMsg(null);
    try {
      const updated = await (window as any).electronAPI.renumberSession(selectedSessionId);
      setItems(updated || []);
      setSuccessMsg('Session sequence numbers and files successfully renumbered!');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Renumbering failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
          Sequence Renumbering Utility
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Fix sequence numbering gaps if files were deleted or removed from a session folder.
        </p>
      </div>

      {/* Session Selection */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
          SELECT DOWNLOAD SESSION TO RENUMBER
        </label>

        <div style={{ display: 'flex', gap: '12px' }}>
          <select
            value={selectedSessionId}
            onChange={(e) => loadItems(e.target.value)}
            className="input-field"
            style={{ flex: 1 }}
          >
            <option value="">Select a Session...</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.completed_files} / {s.total_files} files)
              </option>
            ))}
          </select>

          <button
            onClick={handleExecuteRenumber}
            className="btn btn-primary"
            disabled={!selectedSessionId || loading || items.length === 0}
          >
            <RefreshCw size={16} /> Renumber Files Now
          </button>
        </div>

        {successMsg && (
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Preview Table */}
      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', borderRadius: '12px', padding: '16px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ListOrdered size={18} color="var(--accent-cyan)" /> Session Items Preview
        </h3>

        {items.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
            Select a session above to view item sequence numbers.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item, idx) => {
              const expectedSeq = String(idx + 1).padStart(3, '0');
              const isChanged = item.formatted_sequence !== expectedSeq;
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: isChanged ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                    border: isChanged ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      #{item.formatted_sequence}
                    </span>

                    {isChanged && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--accent-amber)', fontWeight: 600 }}>
                        <ArrowRight size={14} /> #{expectedSeq}
                      </span>
                    )}

                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.original_filename}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Msg ID: #{item.message_id}</p>
                    </div>
                  </div>

                  <span className={`badge badge-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
