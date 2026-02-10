import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RecoveryFallback } from './RecoveryFallback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class SmartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VYBE] Error boundary caught:', error.message);
    if (import.meta.env.DEV) {
      console.error('[SmartErrorBoundary] Stack:', errorInfo.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <RecoveryFallback />;
    }
    return this.props.children;
  }
}

export default SmartErrorBoundary;
