import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useCallStore } from '@/lib/callStore';
import { presentNativeIncomingCall } from '@/lib/nativeIncomingCall';
import {
  buildNotificationRoute,
  declineCallById,
  fetchRingingCall,
  navigateFromNotification,
  normalizeNotificationPayload,
  type NormalizedNotificationPayload,
} from '@/lib/notificationActions';
import {
  enqueuePendingNotification,
  registerPendingNotificationFlusher,
} from '@/lib/pendingNotificationQueue';

async function presentCallFromPush(payload: NormalizedNotificationPayload): Promise<void> {
  if (!payload.callId) return;
  const call = await fetchRingingCall(payload.callId);
  if (!call) return;
  window.dispatchEvent(new CustomEvent('vybe:incoming-call', { detail: call }));
  void presentNativeIncomingCall(call);
}

/**
 * Central handler for push notification taps + action buttons (Answer/Decline),
 * Despia onNotificationEvent metadata, and cold-start deep links (?call=, ?login-approval=).
 */
export function NotificationActionRouter() {
  const { authReady } = useAuth();
  const { acceptCall, dismissIncoming } = useCallStore();
  const location = useLocation();
  const navigate = useNavigate();

  const stripQueryKeys = useCallback((keys: string[]) => {
    const params = new URLSearchParams(location.search);
    let changed = false;
    for (const key of keys) {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const next = params.toString();
    navigate(`${location.pathname}${next ? `?${next}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handlePayload = useCallback(async (payload: NormalizedNotificationPayload) => {
    const isCall =
      payload.type === 'call' ||
      payload.type === 'incoming_call' ||
      !!payload.callId;

    if (isCall && payload.callId && payload.action === 'decline') {
      await declineCallById(payload.callId);
      dismissIncoming();
      toast('Call declined');
      return;
    }

    if (isCall && payload.action === 'accept' && payload.callId) {
      const call = await fetchRingingCall(payload.callId);
      if (!call) {
        toast.error('Call is no longer available');
        if (payload.conversationId) navigate(`/messages/${payload.conversationId}`);
        return;
      }
      navigate(`/messages/${call.conversationId}`);
      try {
        await acceptCall(call);
      } catch (err) {
        console.warn('[NotificationRouter] acceptCall failed:', err);
        toast.error('Could not join call');
      }
      return;
    }

    if (isCall && payload.callId && payload.action === 'open') {
      await presentCallFromPush(payload);
      navigateFromNotification(buildNotificationRoute(payload));
      return;
    }

    if (payload.type === 'login_approval' || payload.type === 'security') {
      if (payload.challengeId) {
        window.dispatchEvent(
          new CustomEvent('vybe:login-approval-push', { detail: { challengeId: payload.challengeId } }),
        );
      }
      navigateFromNotification(buildNotificationRoute(payload));
      return;
    }

    navigateFromNotification(buildNotificationRoute(payload));
  }, [acceptCall, dismissIncoming, navigate]);

  const ingest = useCallback((raw: unknown) => {
    const payload = normalizeNotificationPayload(raw);
    if (!payload) return;

    if (!authReady) {
      enqueuePendingNotification(payload);
      return;
    }

    void handlePayload(payload);
  }, [authReady, handlePayload]);

  useEffect(() => {
    return registerPendingNotificationFlusher((payload) => {
      void handlePayload(payload);
    });
  }, [handlePayload]);

  // Flush queue when auth becomes ready
  useEffect(() => {
    if (!authReady) return;
    // flusher already registered — re-trigger via ingest noop path not needed
  }, [authReady]);

  // Cold-start / in-app URL deep links
  useEffect(() => {
    if (!authReady) return;

    const params = new URLSearchParams(location.search);
    const callId = params.get('call');
    const actionParam = params.get('action');
    const acceptLegacy = params.get('acceptCall') === 'true';
    const loginApproval = params.get('login-approval');

    if (callId) {
      void ingest({
        type: 'call',
        callId,
        conversationId: location.pathname.startsWith('/messages/')
          ? location.pathname.split('/')[2]
          : undefined,
        action: actionParam === 'accept' || acceptLegacy ? 'accept' : 'open',
      });
      stripQueryKeys(['call', 'action', 'acceptCall']);
    }

    if (loginApproval) {
      void ingest({ type: 'login_approval', challengeId: loginApproval, action: 'open' });
      stripQueryKeys(['login-approval']);
    }
  }, [authReady, location.pathname, location.search, ingest, stripQueryKeys]);

  useEffect(() => {
    const onAction = (event: Event) => {
      ingest((event as CustomEvent).detail);
    };
    const onMetadata = (event: Event) => {
      ingest((event as CustomEvent).detail);
    };
    const onIncomingPush = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const payload = normalizeNotificationPayload(detail);
      if (!payload) return;
      if (payload.type === 'call' || payload.type === 'incoming_call') {
        void presentCallFromPush(payload);
      }
    };

    window.addEventListener('vybe:notification-action', onAction);
    window.addEventListener('despia:notification:metadata', onMetadata);
    window.addEventListener('vybe:push-received', onIncomingPush);

    return () => {
      window.removeEventListener('vybe:notification-action', onAction);
      window.removeEventListener('despia:notification:metadata', onMetadata);
      window.removeEventListener('vybe:push-received', onIncomingPush);
    };
  }, [ingest]);

  // OneSignal web SDK notification open (PWA / desktop web)
  useEffect(() => {
    const w = window as Window & { OneSignalDeferred?: Array<(api: any) => Promise<void>> };
    if (!Array.isArray(w.OneSignalDeferred)) w.OneSignalDeferred = [];

    w.OneSignalDeferred.push(async (OneSignal) => {
      try {
        OneSignal?.Notifications?.addEventListener?.('click', (event: any) => {
          const data = event?.notification?.additionalData ?? event?.notification?.data ?? event?.data;
          const actionId = event?.result?.actionId ?? event?.action?.id;
          ingest({ ...(data || {}), action: actionId || data?.action || 'open' });
        });
      } catch (err) {
        console.warn('[NotificationRouter] OneSignal click listener failed:', err);
      }
    });
  }, [ingest]);

  // Service worker → page messages (web push)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'NOTIFICATION_CLICK' || data.type === 'PUSH_NAVIGATE') {
        ingest({ ...data.payload, action: data.action || data.payload?.action || 'open' });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [ingest]);

  return null;
}

/** Called from Despia / native bridges before React auth is ready. */
export function ingestNotificationFromBridge(raw: unknown): void {
  const payload = normalizeNotificationPayload(raw);
  if (!payload) return;
  enqueuePendingNotification(payload);
}
