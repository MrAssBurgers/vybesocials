import { Component, Fragment, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  /** Scope label sent with Sentry events ("root", "route:home", etc.) */
  scope?: string;
  /** Override the fallback UI */
  fallback?: (reset: () => void, error: Error) => ReactNode;
  /**
   * When true, show crash UI. Default false: soft remount so users never see
   * the "Something went wrong" page.
   */
  hardFallback?: boolean;
}

interface State {
  error: Error | null;
  showUi: boolean;
  remountKey: number;
}

/**
 * Catches render-time errors so a single component crash never blanks the
 * whole app. Soft-recovers by default; optional hard fallback for scoped UIs.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showUi: false, remountKey: 0 };
  private resetCount = 0;
  private resetWindowStart = 0;
  private static readonly RESET_LIMIT = 5;
  private static readonly RESET_WINDOW_MS = 4000;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, showUi: false };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const msg = error?.message || '';
    const isChunkError =
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Unable to preload CSS');

    if (isChunkError) {
      if ('caches' in window) {
        void caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
      }
      window.location.reload();
      return;
    }

    // Forward to Sentry and console for local debugging.
    console.error('[ErrorBoundary]', this.props.scope || 'unknown', error, info);
    captureException(error, {
      scope: this.props.scope || 'unknown',
      componentStack: info.componentStack || null,
    });

    if (this.props.hardFallback) {
      this.setState({ error, showUi: true });
      return;
    }

    const now = Date.now();
    if (now - this.resetWindowStart > ErrorBoundary.RESET_WINDOW_MS) {
      this.resetWindowStart = now;
      this.resetCount = 0;
    }
    this.resetCount += 1;
    if (this.resetCount > ErrorBoundary.RESET_LIMIT) {
      this.resetCount = 0;
      this.resetWindowStart = 0;
    }

    // Soft remount — never stick on crash UI.
    this.setState((prev) => ({
      error: null,
      showUi: false,
      remountKey: prev.remountKey + 1,
    }));
  }

  componentDidUpdate(prevProps: Props) {
    // Route-scoped boundaries: navigating to a different route should clear
    // the previous route's crash instead of showing a stale fallback.
    if (this.state.error && prevProps.scope !== this.props.scope) {
      this.setState({ error: null, showUi: false });
    }
  }

  reset = () =>
    this.setState((prev) => ({
      error: null,
      showUi: false,
      remountKey: prev.remountKey + 1,
    }));

  render() {
    const { error, showUi, remountKey } = this.state;
    if (error && showUi) {
      if (this.props.fallback) return this.props.fallback(this.reset, error);

      return (
        <div
          role="alert"
          className="min-h-[50dvh] grid place-items-center px-6 text-center"
        >
          <div className="max-w-sm space-y-4">
            <div className="mx-auto size-14 rounded-2xl bg-destructive/10 grid place-items-center">
              <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Something went wrong here</h2>
              <p className="text-sm text-muted-foreground">
                We've logged the issue. You can keep using the rest of the app.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground active:scale-95 transition-transform"
              >
                <RefreshCw className="size-4" aria-hidden="true" /> Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-full text-sm font-semibold border border-border active:scale-95 transition-transform"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (error && !showUi) {
      return null;
    }

    return <Fragment key={remountKey}>{this.props.children}</Fragment>;
  }
}
