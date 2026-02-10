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
    // Log to console in dev only
    if (import.meta.env.DEV) {
      console.error('[SmartErrorBoundary] Caught error:', error);
      console.error('[SmartErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Show minimal reload button instead of full error UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
