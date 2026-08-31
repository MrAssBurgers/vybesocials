import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FeedFailureNoticeProps {
  label?: string;
  retrying?: boolean;
  onRetry: () => void;
}

export function FeedFailureNotice({ label = 'posts', retrying = false, onRetry }: FeedFailureNoticeProps) {
  return (
    <section role="alert" className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center text-foreground">
      <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-xl font-semibold">Unable to load {label}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">Check your connection and try again. If the problem continues, sign in again.</p>
      <Button type="button" onClick={onRetry} disabled={retrying} className="min-h-11 min-w-32 gap-2">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {retrying ? 'Trying again…' : 'Try again'}
      </Button>
    </section>
  );
}
