import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  aiExplanation: string | null;
  isAnalyzing: boolean;
  errorId: string | null;
}

const MAX_RECOVERY_ATTEMPTS = 3;

class SmartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
      recoveryAttempts: 0,
      aiExplanation: null,
      isAnalyzing: false,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log to console in dev
    if (import.meta.env.DEV) {
      console.error('[SmartErrorBoundary] Caught error:', error);
      console.error('[SmartErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    // Analyze with AI
    this.analyzeError(error, errorInfo);
  }

  async analyzeError(error: Error, errorInfo: ErrorInfo) {
    this.setState({ isAnalyzing: true });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-error`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            error: error.message,
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            userAgent: navigator.userAgent,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        this.setState({
          aiExplanation: data.explanation,
          errorId: data.errorId,
          isAnalyzing: false,
        });
      } else {
        this.setState({
          aiExplanation: "Something went wrong, but don't worry! Try refreshing the page. 🔄",
          isAnalyzing: false,
        });
      }
    } catch {
      this.setState({
        aiExplanation: "Oops! Hit a small bump. A quick refresh should fix things! ✨",
        isAnalyzing: false,
      });
    }
  }

  handleRecover = async () => {
    const { recoveryAttempts } = this.state;

    if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
      // Too many attempts, suggest hard refresh
      window.location.reload();
      return;
    }

    this.setState({ isRecovering: true });

    // Clear any cached state that might be causing issues
    try {
      // Clear React Query cache
      const queryClient = (window as any).__REACT_QUERY_CLIENT__;
      if (queryClient) {
        queryClient.clear();
      }

      // Small delay for effect
      await new Promise(resolve => setTimeout(resolve, 500));

      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRecovering: false,
        recoveryAttempts: recoveryAttempts + 1,
        aiExplanation: null,
        errorId: null,
      });
    } catch {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    window.location.href = '/home';
  };

  handleHardRefresh = () => {
    // Clear caches and reload
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    window.location.reload();
  };

  render() {
    const { hasError, isRecovering, aiExplanation, isAnalyzing, errorId, recoveryAttempts } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) return fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full"
          >
            <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-8 text-center shadow-2xl">
              {/* Animated Icon */}
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6"
              >
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </motion.div>

              <h2 className="text-xl font-semibold text-foreground mb-2">
                Oops! Something went wrong
              </h2>

              {/* AI Explanation */}
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div
                    key="analyzing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 text-muted-foreground py-4"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </motion.div>
                    <span className="text-sm">Analyzing what went wrong...</span>
                  </motion.div>
                ) : (
                  <motion.p
                    key="explanation"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-muted-foreground text-sm mb-6 leading-relaxed"
                  >
                    {aiExplanation || "We're looking into what happened..."}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={this.handleRecover}
                  disabled={isRecovering}
                  className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isRecovering ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </motion.div>
                      Recovering...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Try Again
                    </>
                  )}
                </motion.button>

                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={this.handleGoHome}
                    className="flex-1 py-3 px-4 bg-secondary text-secondary-foreground rounded-xl font-medium flex items-center justify-center gap-2"
                  >
                    <Home className="w-4 h-4" />
                    Home
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={this.handleHardRefresh}
                    className="flex-1 py-3 px-4 bg-secondary text-secondary-foreground rounded-xl font-medium flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </motion.button>
                </div>
              </div>

              {/* Error ID for support */}
              {errorId && (
                <p className="mt-6 text-xs text-muted-foreground/60">
                  Error ID: {errorId}
                </p>
              )}

              {/* Recovery attempts warning */}
              {recoveryAttempts >= 2 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-xs text-amber-500"
                >
                  Multiple recovery attempts. Try clearing your browser cache if issues persist.
                </motion.p>
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    return children;
  }
}

export default SmartErrorBoundary;
