import { Component, ReactNode } from 'react';
import { toast } from 'sonner';
import { reportAppCrash } from '@/lib/bugReportClient';

interface Props {
  onError: () => void;
  /** Short label describing which camera surface this wraps (e.g. "create-studio", "chat-snap"). */
  surface?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Outer error boundary for camera surfaces. If any nested media component
 * throws during render, we close the modal instead of letting the error
 * tear down the entire app, and auto-report it with detailed device info.
 */
export class CameraMountBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    const surface = this.props.surface || 'camera';
    console.warn(`[CameraMountBoundary:${surface}] camera render crashed:`, error);
    try { toast.error('Camera crashed — closing'); } catch {}

    // Fire-and-forget detailed crash report (device, viewport, route, stack).
    reportAppCrash({
      error,
      componentStack: info?.componentStack || null,
      source: `camera:${surface}`,
      reason: `Camera surface "${surface}" crashed while mounting`,
      mode: 'auto',
      context: {
        surface,
        cameraSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
        permissions: typeof navigator !== 'undefined' && (navigator as any).permissions ? 'available' : 'unavailable',
      },
    }).catch(() => {});

    // Defer onError so React can finish unmounting children safely.
    setTimeout(() => {
      try { this.props.onError(); } catch {}
      this.setState({ hasError: false });
    }, 0);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
