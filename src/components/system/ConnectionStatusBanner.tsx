import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'online' | 'offline' | 'reconnecting' | 'restored';

const QUEUE_KEY = 'vybe_offline_action_queue';

function readQueueCount(): number {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Slim top banner that surfaces connection state and queued-action count.
 * - Shows "Offline — N action(s) queued" while disconnected.
 * - Shows "Reconnecting…" briefly when the reconnect manager re-probes.
 * - Flashes "Back online" for 2s after recovery, then hides.
 */
export function ConnectionStatusBanner() {
  const [status, setStatus] = useState<Status>('online');
  const [queueCount, setQueueCount] = useState<number>(() => readQueueCount());

  useEffect(() => {
    const refreshQueue = () => setQueueCount(readQueueCount());
    refreshQueue();

    const handleOffline = () => {
      setStatus('offline');
      refreshQueue();
    };
    const handleOnline = () => {
      setStatus((prev) => (prev === 'online' ? 'online' : 'restored'));
      refreshQueue();
      window.setTimeout(() => {
        setStatus((s) => (s === 'restored' ? 'online' : s));
      }, 2000);
    };
    const handleReconnecting = () => {
      setStatus((prev) => (prev === 'offline' ? 'reconnecting' : prev));
    };

    window.addEventListener('vybe:offline', handleOffline);
    window.addEventListener('vybe:online', handleOnline);
    window.addEventListener('vybe:reconnecting', handleReconnecting);
    window.addEventListener('storage', refreshQueue);

    // Poll queue lightly so local mutations on this tab reflect too
    const t = window.setInterval(refreshQueue, 4000);

    return () => {
      window.removeEventListener('vybe:offline', handleOffline);
      window.removeEventListener('vybe:online', handleOnline);
      window.removeEventListener('vybe:reconnecting', handleReconnecting);
      window.removeEventListener('storage', refreshQueue);
      window.clearInterval(t);
    };
  }, []);

  const visible = status !== 'online';

  let label = '';
  let tone = 'bg-card text-foreground';
  let Icon = Wifi;

  if (status === 'offline') {
    label = queueCount > 0
      ? `Offline — ${queueCount} action${queueCount === 1 ? '' : 's'} queued`
      : 'Offline — changes will sync when you reconnect';
    tone = 'bg-destructive/90 text-destructive-foreground';
    Icon = WifiOff;
  } else if (status === 'reconnecting') {
    label = queueCount > 0
      ? `Reconnecting… ${queueCount} action${queueCount === 1 ? '' : 's'} queued`
      : 'Reconnecting…';
    tone = 'bg-primary/90 text-primary-foreground';
    Icon = Loader2;
  } else if (status === 'restored') {
    label = queueCount > 0 ? `Back online — syncing ${queueCount}` : 'Back online';
    tone = 'bg-emerald-600 text-white';
    Icon = Wifi;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={status}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[100] flex justify-center pointer-events-none"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div
            className={cn(
              'mt-2 mx-3 flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg backdrop-blur text-xs font-medium pointer-events-auto',
              tone
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', status === 'reconnecting' && 'animate-spin')} />
            <span>{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
