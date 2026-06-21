import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useCallStore } from '@/lib/callStore';
import {
  dismissNativeIncomingCall,
  ensureIncomingCallPermissions,
  registerNativeIncomingCallListeners,
} from '@/lib/nativeIncomingCall';
import { fetchRingingCall } from '@/lib/notificationActions';
import { syncNativePushTokens } from '@/lib/pushTokenRegistry';

/**
 * Bridges Capacitor CallKit / Android full-screen incoming call UI
 * back into the VYBE call store (accept / decline).
 */
export function NativeIncomingCallBridge() {
  const { authReady, profile } = useAuth();
  const { acceptCall, dismissIncoming, timeoutIncoming } = useCallStore();

  useEffect(() => {
    if (!authReady || !profile?.id) return;

    void ensureIncomingCallPermissions();
    if (profile?.id) {
      void syncNativePushTokens(profile.id).catch(() => {});
    }

    let cancelled = false;
    let cleanupListeners: (() => void) | undefined;

    void registerNativeIncomingCallListeners({
      onAccepted: async (callId) => {
        if (cancelled) return;
        const call = await fetchRingingCall(callId);
        if (!call) {
          await dismissNativeIncomingCall(callId);
          return;
        }
        try {
          await acceptCall(call);
        } catch (err) {
          console.warn('[NativeIncomingCallBridge] accept failed:', err);
        }
      },
      onDeclined: async (callId) => {
        if (cancelled) return;
        await dismissNativeIncomingCall(callId);
        dismissIncoming();
      },
      onTimedOut: async (callId) => {
        if (cancelled) return;
        await dismissNativeIncomingCall(callId);
        timeoutIncoming();
      },
    }).then((cleanup) => {
      cleanupListeners = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupListeners?.();
    };
  }, [authReady, profile?.id, acceptCall, dismissIncoming, timeoutIncoming]);

  return null;
}
