import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Simplified error boundary - minimal fallback UI
class SmartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Auto-recover from chunk loading errors (stale cache after deploy)
    const msg = error?.message || '';
    const isChunkError = msg.includes('Loading chunk') || 
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Unable to preload CSS');
    
    if (isChunkError) {
      // Clear caches and reload automatically
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
      window.location.reload();
      return;
    }

    // Always log errors so we can diagnose production crashes
    console.error('[SmartErrorBoundary] Caught error:', error?.message, error?.stack);
    console.error('[SmartErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRefresh = () => {
    // Clear caches before reload
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Show error message + reload button so user can report the issue
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-4">
          <p className="text-sm text-muted-foreground text-center max-w-md break-words">
            {this.state.error?.message || 'Something went wrong'}
          </p>
          <button
            onClick={this.handleRefresh}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SmartErrorBoundary;
