import React, { useState } from 'react';
import { TelegramAuthStatus } from '../../types';
import { Send, HelpCircle, AlertCircle, X, ShieldCheck, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { MyTelegramPortal } from './MyTelegramPortal';

interface AuthModalProps {
  authStatus: TelegramAuthStatus;
  onClose: () => void;
  onRefresh: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ authStatus, onClose, onRefresh }) => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  // Load saved credentials on modal mount
  React.useEffect(() => {
    try {
      const api = (window as any).electronAPI;
      if (api && api.getCredentials) {
        api.getCredentials().then((creds: any) => {
          if (creds) {
            if (creds.apiId && creds.apiId !== '0') setApiId(String(creds.apiId));
            if (creds.apiHash) setApiHash(creds.apiHash);
            if (creds.phoneNumber) setPhoneNumber(creds.phoneNumber);
          }
        });
      }
    } catch (e) {}
  }, []);

  // Internal step manager for instantaneous UI transitions
  const [currentStep, setCurrentStep] = useState<'LOGGED_OUT' | 'WAITING_PHONE' | 'WAITING_CODE' | 'WAITING_PASSWORD' | 'LOGGED_IN'>(
    authStatus.isAuthenticated ? 'LOGGED_IN' : authStatus.step || 'LOGGED_OUT'
  );

  React.useEffect(() => {
    if (authStatus.isAuthenticated) {
      setCurrentStep('LOGGED_IN');
    } else if (authStatus.step && authStatus.step !== 'LOGGED_OUT') {
      setCurrentStep(authStatus.step);
    }
  }, [authStatus]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(authStatus.error || null);
  const [showPortal, setShowPortal] = useState(false);

  const getApi = () => {
    const api = (window as any).electronAPI;
    if (!api) {
      throw new Error('Electron API is not initialized. Please run inside TeleFlow Desktop.');
    }
    return api;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiId || !apiHash) {
      setError('Please enter your API ID and API Hash.');
      return;
    }
    if (!phoneNumber || phoneNumber.trim() === '') {
      setError('Please enter your phone number with country prefix (e.g. +34 612 345 678).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      await api.configureCredentials(parseInt(apiId, 10), apiHash, 'krishnaldrbot', 'krishnaebot', 'production');
      const status = await api.sendAuthCode(phoneNumber.trim());
      if (status && status.step) {
        setCurrentStep(status.step);
      } else {
        setCurrentStep('WAITING_CODE');
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim() === '') {
      setError('Please enter the 5-digit verification code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const status = await api.signIn(code.trim());
      if (status) {
        if (status.isAuthenticated || status.step === 'LOGGED_IN') {
          setCurrentStep('LOGGED_IN');
          onRefresh();
          setTimeout(() => onClose(), 1200);
          return;
        } else if (status.step) {
          setCurrentStep(status.step);
        }
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your 2FA password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const status = await api.checkPassword(password);
      if (status) {
        if (status.isAuthenticated || status.step === 'LOGGED_IN') {
          setCurrentStep('LOGGED_IN');
          onRefresh();
          setTimeout(() => onClose(), 1200);
          return;
        } else if (status.step) {
          setCurrentStep(status.step);
        }
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Incorrect 2FA password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      const api = getApi();
      await api.logout();
      setCurrentStep('LOGGED_OUT');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ background: 'rgba(9, 12, 21, 0.85)', backdropFilter: 'blur(12px)' }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
        >
          <X size={18} />
        </button>

        {/* Telegram Header Badge */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: '#0088cc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(0, 136, 204, 0.4)',
          marginBottom: '16px'
        }}>
          <Send size={32} style={{ transform: 'translate(-2px, 2px)' }} />
        </div>

        {/* Welcome Title */}
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', marginBottom: '6px', textAlign: 'center' }}>
          Welcome
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '24px', textAlign: 'center' }}>
          Set up your Telegram access to get started.
        </p>

        {/* Error Alert */}
        {error && (
          <div style={{
            width: '100%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            color: '#f87171',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Authenticated State */}
        {currentStep === 'LOGGED_IN' ? (
          <div style={{
            width: '100%',
            background: '#161d2a',
            border: '1px solid #232d3f',
            borderRadius: '16px',
            padding: '32px 24px',
            textAlign: 'center'
          }}>
            <CheckCircle2 size={56} color="#10b981" style={{ marginBottom: '12px' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
              Connected to Telegram
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '24px' }}>
              Logged in as <strong>{authStatus.user?.firstName || 'Telegram User'}</strong> ({authStatus.user?.phone || phoneNumber})
            </p>

            <button onClick={handleLogout} className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              Disconnect Session
            </button>
          </div>
        ) : (
          /* Card Container */
          <div style={{
            width: '100%',
            background: '#161d2a',
            border: '1px solid #232d3f',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)'
          }}>

            {/* Step 1: Credentials & Phone Form */}
            {currentStep === 'LOGGED_OUT' && (
              <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Step Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#0088cc',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    1
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Telegram API credentials
                  </h3>
                </div>

                {/* Subtext with link */}
                <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.45 }}>
                  Go to <a href="https://my.telegram.org" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>my.telegram.org</a>, sign in with your phone, go to <strong>API development tools</strong>, create an application and copy the data here.
                </p>

                {/* Not sure how Button */}
                <button
                  type="button"
                  onClick={() => setShowPortal(true)}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid #0088cc',
                    color: '#38bdf8',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <HelpCircle size={15} /> Not sure how? We explain it step by step
                </button>

                {/* API ID Input */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                    API ID
                  </label>
                  <input
                    type="text"
                    placeholder="12345678"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* API Hash Input */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                    API Hash
                  </label>
                  <input
                    type="text"
                    placeholder="0123456789abcdef0123456789abcdef"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Phone Input */}
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    Phone (with country code) <HelpCircle size={13} color="#64748b" />
                  </label>
                  <input
                    type="tel"
                    placeholder="+34 612 345 678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Send Code Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: '#0088cc',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '8px',
                    boxShadow: '0 4px 12px rgba(0, 136, 204, 0.3)'
                  }}
                >
                  <Send size={18} /> {loading ? 'Sending code...' : 'Send code'}
                </button>
              </form>
            )}

            {/* Step 2: Verification Code Input */}
            {currentStep === 'WAITING_CODE' && (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      2
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                      Enter verification code
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentStep('LOGGED_OUT')}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                  A 5-digit code was sent to your Telegram app on <strong>{phoneNumber}</strong>.
                </p>

                <div>
                  <input
                    type="text"
                    placeholder="12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      color: '#fff',
                      fontSize: '1.2rem',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '6px',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: '#10b981',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <ShieldCheck size={18} /> {loading ? 'Verifying...' : 'Verify Code & Log in'}
                </button>
              </form>
            )}

            {/* Step 3: 2FA Password Input */}
            {currentStep === 'WAITING_PASSWORD' && (
              <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#f59e0b',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    3
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Two-step verification password
                  </h3>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                  Your Telegram account requires your 2FA password to complete login.
                </p>

                <div>
                  <input
                    type="password"
                    placeholder="Enter 2FA password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: '#f59e0b',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Lock size={18} /> {loading ? 'Unlocking...' : 'Submit password'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Portal Modal */}
      {showPortal && (
        <MyTelegramPortal
          onClose={() => setShowPortal(false)}
          onApplyCredentials={(id, hash) => {
            setApiId(id);
            setApiHash(hash);
          }}
        />
      )}
    </div>
  );
};
