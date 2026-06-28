/**
 * Native lock-screen / full-screen incoming call presentation.
 *
 * - Capacitor: @capgo/capacitor-incoming-call-kit (CallKit iOS, full-screen intent Android)
 * - Despia: keep screen awake during ring via scanningmode://auto
 * - Web/PWA: in-app overlay only (GlobalCallOverlay)
 */
import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime, despiaCall } from '@/lib/despiaBridge';
import type { CallData } from '@/lib/callStore';

const INCOMING_CALL_TIMEOUT_MS = 30_000;
let activeNativeCallId: string | null = null;
let permissionsRequested = false;

async function getIncomingCallKit(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const capNative =
    Capacitor.isNativePlatform() ||
    Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  if (!capNative) return null;
  try {
    const mod = await import('@capgo/capacitor-incoming-call-kit');
    const plugin: any = mod.IncomingCallKit;
    // Wrap so `await getIncomingCallKit()` doesn't invoke the Capacitor proxy's `.then`
    // (which throws "not implemented on web" on non-native runtimes).
    return {
      requestPermissions: (...a: any[]) => plugin.requestPermissions(...a),
      requestFullScreenIntentPermission: (...a: any[]) => plugin.requestFullScreenIntentPermission(...a),
      showIncomingCall: (...a: any[]) => plugin.showIncomingCall(...a),
      endCall: (...a: any[]) => plugin.endCall(...a),
      addListener: (...a: any[]) => plugin.addListener(...a),
    };
  } catch (err) {
    console.warn('[NativeIncomingCall] plugin unavailable:', err);
    return null;
  }
}

export async function ensureIncomingCallPermissions(): Promise<void> {
  if (permissionsRequested) return;
  permissionsRequested = true;

  const kit = await getIncomingCallKit();
  if (kit) {
    try {
      await kit.requestPermissions();
      await kit.requestFullScreenIntentPermission();
    } catch (err) {
      console.warn('[NativeIncomingCall] permission request failed:', err);
    }
    return;
  }

  if (isDespiaRuntime()) {
    try {
      await despiaCall('registerpush://', [], 1_500);
    } catch { /* noop */ }
  }
}

function callerLabel(call: CallData): string {
  if (call.isGroupCall && call.groupName) return call.groupName;
  return call.caller?.display_name || call.caller?.username || 'Someone';
}

export async function presentNativeIncomingCall(call: CallData): Promise<void> {
  activeNativeCallId = call.id;

  if (isDespiaRuntime()) {
    void despiaCall('scanningmode://auto', [], 500);
  }

  const kit = await getIncomingCallKit();
  if (!kit) return;

  try {
    await kit.showIncomingCall({
      callId: call.id,
      callerName: callerLabel(call),
      handle: call.caller?.username || call.conversationId,
      appName: 'VYBE',
      hasVideo: call.callType === 'video',
      timeoutMs: INCOMING_CALL_TIMEOUT_MS,
      acceptText: 'Answer',
      declineText: 'Decline',
      extra: {
        conversationId: call.conversationId,
        callType: call.callType,
        callerId: call.caller?.id,
      },
      android: {
        channelId: 'vybe_incoming_calls',
        channelName: 'Incoming Calls',
        showFullScreen: true,
        isHighPriority: true,
        accentColor: '#8B5CF6',
      },
      ios: {
        handleType: 'generic',
      },
    });
  } catch (err) {
    console.warn('[NativeIncomingCall] showIncomingCall failed:', err);
  }
}

export async function dismissNativeIncomingCall(callId?: string): Promise<void> {
  const id = callId || activeNativeCallId;
  if (!id) return;

  if (isDespiaRuntime()) {
    void despiaCall('scanningmode://off', [], 500);
  }

  const kit = await getIncomingCallKit();
  if (kit) {
    try {
      await kit.endCall({ callId: id, reason: 'dismissed' });
    } catch (err) {
      console.warn('[NativeIncomingCall] endCall failed:', err);
    }
  }

  if (activeNativeCallId === id) activeNativeCallId = null;
}

export async function registerNativeIncomingCallListeners(handlers: {
  onAccepted: (callId: string, extra?: Record<string, unknown>) => void;
  onDeclined: (callId: string) => void;
  onTimedOut: (callId: string) => void;
}): Promise<() => void> {
  const kit = await getIncomingCallKit();
  if (!kit) return () => {};

  const handles = await Promise.all([
    kit.addListener('callAccepted', (event) => {
      handlers.onAccepted(event.call.callId, event.call.extra);
    }),
    kit.addListener('callDeclined', (event) => {
      handlers.onDeclined(event.call.callId);
    }),
    kit.addListener('callTimedOut', (event) => {
      handlers.onTimedOut(event.call.callId);
    }),
    kit.addListener('callEnded', (event) => {
      if (event.call.state === 'ended') handlers.onDeclined(event.call.callId);
    }),
  ]);

  return () => {
    void Promise.all(handles.map((h) => h.remove()));
  };
}
