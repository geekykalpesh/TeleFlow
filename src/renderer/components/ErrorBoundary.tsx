import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: 'var(--bg-dark, #09090B)',
          color: 'var(--text-main, #FAFAFA)',
          fontFamily: 'var(--font-sans)',
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--bg-card, #18181B)',
            border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '12px' }}>Oops, something went wrong.</h1>
            <p style={{ color: 'var(--text-muted, #A1A1AA)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.5 }}>
              The application encountered an unexpected error. Don't worry, your background downloads are likely still running safely in the main process.
            </p>
            
            <div style={{ 
              background: 'rgba(0,0,0,0.2)', 
              padding: '12px', 
              borderRadius: '8px', 
              marginBottom: '24px',
              textAlign: 'left',
              overflow: 'auto',
              maxHeight: '100px'
            }}>
              <code style={{ color: '#f87171', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                {this.state.error?.toString()}
              </code>
            </div>

            <button 
              onClick={this.handleReload}
              className="btn btn-primary"
              style={{ padding: '10px 24px', display: 'inline-flex', gap: '8px', alignItems: 'center' }}
            >
              <RefreshCw size={16} /> Reload Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
