import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppErrorFallbackProps {
  title?: string;
  description?: string;
  compact?: boolean;
  onRetry?: () => void;
}

/** Default fallback when SmartErrorBoundary catches without a custom fallback. */
export function AppErrorFallback({
  title = 'Something went wrong',
  description = "VYBE hit a snag. You can try again or reload — the rest of your data is safe.",
  compact = false,
  onRetry,
}: AppErrorFallbackProps) {
  return (
    <div
      className={
        compact
          ? 'min-h-[200px] page-shell flex flex-col items-center justify-center p-6 gap-4 text-center'
          : 'min-h-[50dvh] page-shell vybe-loading-shell flex flex-col items-center justify-center p-8 gap-5 text-center'
      }
    >
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" className="gap-2 rounded-full" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button
          variant="default"
          className="gap-2 rounded-full"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="w-4 h-4" />
          Reload
        </Button>
        <Button
          variant="secondary"
          className="gap-2 rounded-full"
          onClick={() => {
            window.location.href = '/home';
          }}
        >
          <Home className="w-4 h-4" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
