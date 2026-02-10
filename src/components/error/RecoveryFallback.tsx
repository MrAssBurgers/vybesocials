import { RefreshCw } from 'lucide-react';

export function RecoveryFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      gap: '1.5rem',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
        Vybe is recovering
      </h1>
      <p style={{ fontSize: '0.875rem', opacity: 0.6, margin: 0, textAlign: 'center' }}>
        Something went wrong during startup. Try refreshing.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.75rem',
          border: 'none',
          background: '#7c3aed',
          color: 'white',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={18} />
        Refresh
      </button>
    </div>
  );
}
