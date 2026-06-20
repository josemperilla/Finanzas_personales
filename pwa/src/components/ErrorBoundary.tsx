import { Component, ReactNode } from 'react';

interface State { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center',
          background: '#f5f5f2', fontFamily: 'sans-serif',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#111', marginBottom: 8 }}>
            Algo salió mal
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 24, maxWidth: 280 }}>
            {error.message || 'Error inesperado en la aplicación'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px', borderRadius: 12,
              background: '#3b82f6', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 15,
            }}
          >
            Recargar app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
