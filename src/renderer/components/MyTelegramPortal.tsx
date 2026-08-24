import React, { useState } from 'react';
import { ExternalLink, X, Globe, Key, CheckCircle2, ArrowRight } from 'lucide-react';

interface MyTelegramPortalProps {
  onClose: () => void;
  onApplyCredentials: (apiId: string, apiHash: string, appTitle: string, shortName: string) => void;
}

export const MyTelegramPortal: React.FC<MyTelegramPortalProps> = ({ onClose, onApplyCredentials }) => {
  const [extractedApiId, setExtractedApiId] = useState('');
  const [extractedApiHash, setExtractedApiHash] = useState('');
  const [appTitle, setAppTitle] = useState('krishnaldrbot');
  const [shortName, setShortName] = useState('krishnaebot');
  const [applied, setApplied] = useState(false);

  const handleOpenExternal = () => {
    (window as any).electronAPI?.openPath?.('https://my.telegram.org/auth');
  };

  const handleApply = () => {
    if (!extractedApiId || !extractedApiHash) return;
    onApplyCredentials(extractedApiId, extractedApiHash, appTitle, shortName);
    setApplied(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content" style={{ maxWidth: '960px', width: '92vw', height: '88vh', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden', position: 'relative' }}>
        {/* Top Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(9, 12, 21, 0.9)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Globe size={20} color="var(--accent-cyan)" />
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>my.telegram.org Authentication & API Portal</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Telegram portal to register your app credentials.</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleOpenExternal} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
              <ExternalLink size={14} /> Open in System Browser
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Body Split View */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Embedded Webview / Iframe */}
          <div style={{ flex: 1, borderRight: '1px solid var(--border-color)', background: '#fff', position: 'relative' }}>
            <iframe
              src="https://my.telegram.org/auth"
              title="my.telegram.org Auth Portal"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>

          {/* Right Assistant & Extraction Panel */}
          <div style={{ width: '320px', background: 'var(--bg-sidebar)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={16} /> QUICK CREDENTIAL IMPORT
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Follow the 3 steps on the left, then paste your generated keys here:
              </p>
            </div>

            {/* Step Guides */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ display: 'flex', gap: '6px' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>1.</strong> Log in with phone & confirmation code.
              </p>
              <p style={{ display: 'flex', gap: '6px' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>2.</strong> Click <strong>API development tools</strong>.
              </p>
              <p style={{ display: 'flex', gap: '6px' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>3.</strong> Create app & copy your keys below.
              </p>
            </div>

            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>App api_id</label>
                <input
                  type="text"
                  placeholder="e.g. 28923"
                  className="input-field"
                  value={extractedApiId}
                  onChange={(e) => setExtractedApiId(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>App api_hash</label>
                <input
                  type="text"
                  placeholder="e.g. c671dcb553990caaa73"
                  className="input-field"
                  value={extractedApiHash}
                  onChange={(e) => setExtractedApiHash(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>App Title</label>
                <input
                  type="text"
                  placeholder="krishnaldrbot"
                  className="input-field"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Short Name</label>
                <input
                  type="text"
                  placeholder="krishnaebot"
                  className="input-field"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                />
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={handleApply}
              className="btn btn-primary"
              disabled={!extractedApiId || !extractedApiHash}
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', padding: '12px' }}
            >
              {applied ? <><CheckCircle2 size={16} /> Applied to TeleFlow!</> : <><ArrowRight size={16} /> Apply to TeleFlow</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
