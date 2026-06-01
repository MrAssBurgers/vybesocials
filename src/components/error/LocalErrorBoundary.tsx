import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportAppCrash } from '@/lib/bugReportClient';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Local error boundary for non-critical subtrees (deferred hooks, lazy overlays).
 * Catches the error so it can't bubble up to the root SmartErrorBoundary and
 * blank the whole app (which would unmount AuthProvider and trigger a cascade
 * of "useAuth must be used within an AuthProvider" + uuid:"undefined" 400s).
 *
 * Renders nothing on error — these mounts have no visible output. Silently
 * fire-and-forget reports the crash so monitoring still works.
 */
class LocalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
       
      console.warn(
        `[LocalErrorBoundary${this.props.label ? `:${this.props.label}` : ''}] caught:`,
        error?.message,
      );
      void reportAppCrash({
        error,
        componentStack: info.componentStack,
        mode: 'auto',
        source: `local_error_boundary${this.props.label ? `:${this.props.label}` : ''}`,
      });
    } catch {
      /* never throw from a boundary */
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default LocalErrorBoundary;
