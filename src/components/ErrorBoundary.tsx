import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  /** Scope label sent with Sentry events ("root", "route:home", etc.) */
  scope?: string;
  /** Override the fallback UI */
  fallback?: (reset: () => void, error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a single component crash never blanks the
 * whole app. Reports to Sentry (when configured) and gives the user a way
 * out (reset → re-mount, or hard reload).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Forward to Sentry and console for local debugging.
     
    console.error('[ErrorBoundary]', this.props.scope || 'unknown', error, info);
    captureException(error, {
      scope: this.props.scope || 'unknown',
      componentStack: info.componentStack || null,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

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
}
