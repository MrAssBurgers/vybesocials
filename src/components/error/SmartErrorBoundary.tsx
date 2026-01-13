import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Simplified error boundary - just catches errors and recovers silently
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
    
    // Auto-recover after a brief moment
    setTimeout(() => {
      this.setState({ hasError: false, error: null });
    }, 100);
  }

  render() {
    // Always render children - never show error UI
    return this.props.children;
  }
}

export default SmartErrorBoundary;
