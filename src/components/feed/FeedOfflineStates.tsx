import { motion } from 'framer-motion';
import { WifiOff, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OfflineNoCacheProps {
  onRetry?: () => void;
  className?: string;
}

/** Shown when offline and there is nothing in the React Query cache yet. */
export function FeedOfflineNoCache({ onRetry, className }: OfflineNoCacheProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm p-8 text-center space-y-4',
        className,
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto">
        <WifiOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">You&apos;re offline</h3>
        <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
          Connect once to load your feed. After that, VYBE keeps your last posts ready even without signal.
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" className="rounded-full gap-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </motion.div>
  );
}

/** Slim banner when viewing persisted/cached feed while offline. */
export function FeedOfflineCachedBanner({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={cn(
        'mb-3 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-foreground/90',
        className,
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span>Offline — showing your saved feed</span>
    </motion.div>
  );
}

interface FriendLinkNudgeProps {
  onOpen: () => void;
  onDismiss: () => void;
}

const DISMISS_KEY = 'vybe_friendlink_spotlight_dismissed';

export function getFriendLinkSpotlightDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissFriendLinkSpotlight(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch { /* ignore */ }
}

/** Home feed nudge — tap-to-connect hero differentiator. */
export function FriendLinkSpotlight({ onOpen, onDismiss }: FriendLinkNudgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 p-4 mb-4"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg"
        aria-label="Dismiss"
      >
        Not now
      </button>
      <div className="flex gap-3 items-start pr-16">
        <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-0.5">Friend Link</p>
          <h3 className="text-sm font-bold text-foreground mb-1">Tap phones. You&apos;re friends.</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            No usernames to trade — NFC or QR connects you in seconds.
          </p>
          <Button
            size="sm"
            className="rounded-full h-8 text-xs px-4"
            onClick={onOpen}
          >
            Try Friend Link
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
