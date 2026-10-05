import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { muteSmartPingsForOneHour } from '@/lib/notificationPreferenceService';
import { toast } from 'sonner';

/**
 * Listens for service worker messages (smart-ping mute action) and
 * invalidates notification queries when the SW posts updates.
 */
export function SmartPingBridge() {
  const queryClient = useQueryClient();
  const account = useProfileAccount();
  const uid = account.user?.id || '', profileId = account.profile?.id || '';
  const context = useMemo(() => ({ active: true, pending: false, guard: account.guard, ready: account.ready }), [uid, profileId, account.session.epoch, account.ready]);

  useEffect(() => {
    context.active = true;
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'MUTE_SMART_PINGS' && msg.hours === 1 && !context.pending) {
        if (!context.ready || typeof msg.recipientUid !== 'string' || msg.recipientUid !== uid) {
          toast.error('Open notification settings for the account that received this ping to mute it.');
          return;
        }
        const guard = () => { context.guard(); if (!context.active) throw new Error('Notification view changed.'); };
        try {
          guard(); context.pending = true;
          const state = await muteSmartPingsForOneHour({ uid, profileId }, guard);
          guard();
          void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
          const expiry = state.preferences.brief_muted_until || 0;
          toast.success(expiry > Date.now() ? `Smart pings are muted until ${new Date(expiry).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'That one-hour mute has already ended.');
        } catch (err) {
          try { guard(); } catch { return; }
          toast.error(err instanceof Error ? err.message : 'The mute was not confirmed. Try again.');
        } finally { context.pending = false; }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => { context.active = false; navigator.serviceWorker.removeEventListener('message', handler); };
  }, [queryClient, context, uid, profileId]);

  return null;
}
