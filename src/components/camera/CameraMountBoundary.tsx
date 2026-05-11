import { Component, ReactNode } from 'react';
import { toast } from 'sonner';

interface Props {
  onError: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Outer error boundary for camera surfaces. If VybeSnapCamera (or any nested
 * media component) throws during render, we close the modal instead of
 * letting the error tear down the entire ChatView / app.
 */
export class CameraMountBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[CameraMountBoundary] camera render crashed:', error);
    try {
      toast.error('Camera crashed — closing');
    } catch {}
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
