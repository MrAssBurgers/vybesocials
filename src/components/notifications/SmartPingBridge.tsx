import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Listens for service worker messages (smart-ping mute action) and
 * invalidates notification queries when the SW posts updates.
 */
export function SmartPingBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'MUTE_SMART_PINGS') {
        try {
          await db.functions.invoke('mute-smart-pings', {
            body: { hours: msg.hours || 1 },
          });
          queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
        } catch (err) {
          console.warn('[SmartPing] mute failed', err);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [queryClient]);

  return null;
}
