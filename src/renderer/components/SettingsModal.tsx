import React, { useState } from 'react';
import { AppSettings } from '../../types';
import { Folder, Key, Sliders, Save, CheckCircle2 } from 'lucide-react';

interface SettingsModalProps {
  onRefresh: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onRefresh }) => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [speedLimit, setSpeedLimit] = useState(0);
  const [defaultFolder, setDefaultFolder] = useState('');
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    try {
      const api = (window as any).electronAPI;
      if (api) {
        if (api.getCredentials) {
          api.getCredentials().then((creds: any) => {
            if (creds) {
              if (creds.apiId && creds.apiId !== '0') setApiId(String(creds.apiId));
              if (creds.apiHash) setApiHash(creds.apiHash);
            }
          });
        }
        if (api.getAllSettings) {
          api.getAllSettings().then((settings: Record<string, string>) => {
            if (settings) {
              if (settings['default_destination']) setDefaultFolder(settings['default_destination']);
              if (settings['concurrency']) setConcurrency(parseInt(settings['concurrency'], 10) || 1);
              if (settings['max_speed_limit']) setSpeedLimit(parseInt(settings['max_speed_limit'], 10) || 0);
            }
          });
        }
      }
    } catch (e) {}
  }, []);

  const handleSelectFolder = async () => {
    const folder = await (window as any).electronAPI.selectDirectory();
    if (folder) {
      setDefaultFolder(folder);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = (window as any).electronAPI;
    if (api) {
      if (apiId && apiHash) {
        await api.configureCredentials(parseInt(apiId, 10), apiHash);
      }
      if (api.setConcurrency) {
        await api.setConcurrency(concurrency);
      }
      if (api.setDefaultFolder) {
        await api.setDefaultFolder(defaultFolder);
      }
      if (api.setSpeedLimit) {
        await api.setSpeedLimit(speedLimit);
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onRefresh();
  };

  const handleExportBackup = async () => {
    try {
      const json = await (window as any).electronAPI.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TeleFlow_Backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'Backup export failed');
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const json = event.target?.result as string;
            const res = await (window as any).electronAPI.importBackup(json);
            alert(`Successfully imported ${res.importedSessions} session(s) and ${res.importedItems} item(s)!`);
            onRefresh();
          } catch (err: any) {
            alert(err.message || 'Import failed');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
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

        {/* Speed Limiter */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="#f59e0b" /> Bandwidth Speed Limiter (Throttle)
          </h3>
          <select
            className="input-field"
            value={speedLimit}
            onChange={(e) => setSpeedLimit(parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          >
            <option value={0}>Unlimited (Full Speed)</option>
            <option value={1048576}>1 MB/s</option>
            <option value={2097152}>2 MB/s</option>
            <option value={5242880}>5 MB/s</option>
            <option value={10485760}>10 MB/s</option>
            <option value={20971520}>20 MB/s</option>
          </select>
        </div>

        {/* Queue Backup & Restore */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={18} color="#c084fc" /> Queue Backup & Restore
          </h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={handleExportBackup} className="btn btn-secondary" style={{ flex: 1 }}>
              Export Queue to JSON
            </button>
            <button type="button" onClick={handleImportBackup} className="btn btn-secondary" style={{ flex: 1 }}>
              Import Queue from JSON
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
