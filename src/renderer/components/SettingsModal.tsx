import React, { useState } from 'react';
import { AppSettings } from '../../types';
import { Folder, Key, Sliders, Save, CheckCircle2 } from 'lucide-react';

interface SettingsModalProps {
  onRefresh: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onRefresh }) => {
  const [apiId, setApiId] = useState('2040');
  const [apiHash, setApiHash] = useState('b18441a1ed609c10d4d129856a5b663e');
  const [concurrency, setConcurrency] = useState(1);
  const [defaultFolder, setDefaultFolder] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSelectFolder = async () => {
    const folder = await (window as any).electronAPI.selectDirectory();
    if (folder) {
      setDefaultFolder(folder);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await (window as any).electronAPI.configureCredentials(parseInt(apiId, 10), apiHash);
    await (window as any).electronAPI.setConcurrency(concurrency);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onRefresh();
  };

  return (
    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
          Application Settings
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Configure API credentials, queue worker limits, and default destination directories.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* API Credentials */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={18} color="var(--accent-cyan)" /> Telegram API Credentials
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>API ID</label>
              <input
                type="text"
                className="input-field"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>API Hash</label>
              <input
                type="text"
                className="input-field"
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Concurrency Settings */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="var(--accent-purple)" /> Queue Worker Concurrency
          </h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              Active Concurrent Downloads: <strong>{concurrency}</strong> {concurrency === 1 ? '(Sequential Mode)' : '(Parallel Mode)'}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Sequential mode guarantees 100% strict single-file sequential execution. Fixed sequence numbers (`001`, `002`) remain immutable regardless of worker count.
          </p>
        </div>

        {/* Default Destination */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={18} color="var(--accent-green)" /> Default Output Folder
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="System Downloads folder"
              value={defaultFolder}
              onChange={(e) => setDefaultFolder(e.target.value)}
            />
            <button type="button" onClick={handleSelectFolder} className="btn btn-secondary">
              Browse
            </button>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px' }}>
            <Save size={16} /> Save Settings
          </button>
          {saved && (
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} /> Settings saved!
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
