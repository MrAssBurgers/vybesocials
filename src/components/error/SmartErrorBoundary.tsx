import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Home, AlertTriangle, Loader2, Bug, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { reportAppCrash } from '@/lib/bugReportClient';
import { isRecoverableDmCacheError, persistBoundaryError } from '@/lib/recoverDmQueryCache';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  bugReported: boolean;
  isReportingBug: boolean;
  aiExplanation: string | null;
  isAnalyzing: boolean;
  errorId: string | null;
}

class SmartErrorBoundary extends Component<Props, State> {
  // Loop guard: if the same subtree keeps throwing after auto-reset, stop
  // resetting to break the catch → setState → re-render → throw cycle that
  // triggers React's "Maximum update depth exceeded".
  private resetCount = 0;
  private resetWindowStart = 0;
  private static readonly RESET_LIMIT = 3;
  private static readonly RESET_WINDOW_MS = 2000;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      bugReported: false,
      isReportingBug: false,
      aiExplanation: null,
      isAnalyzing: false,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = error?.message || '';
    const isChunkError = msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Unable to preload CSS');

    if (isChunkError) {
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
      window.location.reload();
      return;
    }

    // Treat transient network/fetch errors (slow internet, offline blips) as
    // recoverable — never show the "Something went wrong" screen for these.
    const isNetworkError =
      !navigator.onLine ||
      /Failed to fetch|NetworkError|Load failed|TypeError: fetch|ERR_NETWORK|ERR_INTERNET|timeout|AbortError|The operation was aborted/i.test(msg) ||
      (error?.name === 'TypeError' && /fetch/i.test(msg));

    if (isNetworkError) {
      console.warn('[SmartErrorBoundary] Suppressed transient network error:', msg);
      setTimeout(() => this.setState({ hasError: false, error: null, errorInfo: null }), 0);
      return;
    }

    console.error('[SmartErrorBoundary] Caught error:', error?.message, error?.stack);
    console.error('[SmartErrorBoundary] Component stack:', errorInfo.componentStack);

    // Fire-and-forget crash report.
    void this.reportCrash(error, errorInfo.componentStack, 'auto');

    // Loop guard: track resets in a short window. If we exceed the limit,
    // stop auto-resetting and show fallback UI so the user is never stuck on blank.
    const now = Date.now();
    if (now - this.resetWindowStart > SmartErrorBoundary.RESET_WINDOW_MS) {
      this.resetWindowStart = now;
      this.resetCount = 0;
    }
    this.resetCount += 1;

    // Custom fallback (e.g. Messages): recover DM cache for stack/cache errors, then show fallback.
    if (this.props.fallback) {
      const recoverable = isRecoverableDmCacheError(error);
      if (recoverable) {
        try {
          const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: import('@tanstack/react-query').QueryClient }).__REACT_QUERY_CLIENT__;
          if (qc) {
            void import('@/lib/recoverDmQueryCache').then(({ recoverDmQueryCache }) => {
              recoverDmQueryCache(qc);
              this.resetCount = 0;
              this.resetWindowStart = 0;
              this.setState({ hasError: false, error: null, errorInfo: null });
            });
            return;
          }
        } catch {
          /* fall through to fallback */
        }
      }
      persistBoundaryError(error);
      this.setState({ errorInfo, hasError: true, error });
      return;
    }

    if (this.resetCount > SmartErrorBoundary.RESET_LIMIT) {
      console.warn('[SmartErrorBoundary] Reset loop detected — showing fallback.');
      persistBoundaryError(error);
      this.setState({ errorInfo, hasError: true, error });
      return;
    }

    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  reportCrash = async (
    error: Error,
    componentStack?: string | null,
    mode: 'auto' | 'manual' = 'auto',
  ) => {
    this.setState({ isReportingBug: true });

    const { bugReported } = await reportAppCrash({
      error,
      componentStack,
      mode,
      source: 'smart_error_boundary',
    });

    this.setState((prevState) => ({
      bugReported: prevState.bugReported || bugReported,
      isReportingBug: false,
    }));
  };

  analyzeError = async (error: Error, errorInfo: ErrorInfo) => {
    this.setState({ isAnalyzing: true });
    try {
      const { data } = await db.functions.invoke('analyze-error', {
        body: {
          error: error.message,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
      this.setState({
        aiExplanation: data?.explanation || null,
        errorId: data?.errorId || null,
        isAnalyzing: false,
      });
    } catch {
      this.setState({
        aiExplanation: "Something went wrong, but don't worry — try refreshing! 🔄",
        isAnalyzing: false,
      });
    }
  };

  handleRetry = () => {
    this.resetCount = 0;
    this.resetWindowStart = 0;
    this.setState({ hasError: false, error: null, errorInfo: null, aiExplanation: null, errorId: null, bugReported: false, isReportingBug: false });
  };

  handleReportBug = async () => {
    if (!this.state.error) return;
    await this.reportCrash(this.state.error, this.state.errorInfo?.componentStack, 'manual');
  };

  handleRefresh = () => {
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[200px] bg-background flex flex-col items-center justify-center p-6 gap-5">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>

          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>

          {this.state.isAnalyzing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing what happened...
            </div>
          ) : this.state.aiExplanation ? (
            <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
              {this.state.aiExplanation}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          )}

          {this.state.errorId && (
            <span className="text-xs text-muted-foreground/60 font-mono">
              Error ID: {this.state.errorId}
            </span>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Home className="w-4 h-4" />
              Go Home
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={this.handleRefresh}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Hard refresh (clear cache)
            </button>
            <button
              onClick={this.handleReportBug}
              disabled={this.state.bugReported || this.state.isReportingBug}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-50"
            >
              {this.state.isReportingBug ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Reporting...</>
              ) : this.state.bugReported ? (
                <><Check className="w-3 h-3 text-primary" /> Bug Reported</>
              ) : (
                <><Bug className="w-3 h-3" /> Report Bug</>
              )}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SmartErrorBoundary;
