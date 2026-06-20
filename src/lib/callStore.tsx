/**
 * Global Call Store — Dual-Mode Edition (P2P + LiveKit)
 * 
 * Single source of truth for call state. Event-driven state machine.
 * States: idle → creating → joining → connected → ending → idle
 *         idle → ringing (incoming) → joining → connected → ending → idle
 * 
 * Two call modes:
 * - "p2p" (default, free): Direct WebRTC peer-to-peer, no media server
 * - "persistent" (premium): LiveKit SFU, persistent rooms, rejoin support
 * 
 * Mode switching: controlled reconnect — tear down old, build new.
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';
import { toast } from 'sonner';
import { stopCameraStream } from '@/hooks/useCameraPreload';
import { useSyncCustomSounds } from '@/hooks/useCustomSounds';
import { warmCallMedia, clearWarmCallMedia } from '@/lib/callMediaWarmup';
import { invokeLiveKitCallToken } from '@/lib/livekitCallToken';
import { dismissNativeIncomingCall, presentNativeIncomingCall } from '@/lib/nativeIncomingCall';

export type CallPhase = 'idle' | 'ringing' | 'creating' | 'joining' | 'connected' | 'ending' | 'switching' | 'error';
export type CallType = 'audio' | 'video';
export type CallMode = 'p2p' | 'persistent';

export interface CallUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CallData {
  id: string;
  roomName: string;
  livekitUrl: string;
  token: string;
  callType: CallType;
  callMode: CallMode;
  conversationId: string;
  caller: CallUser;
  receiver: CallUser;
  isInitiator: boolean;
  // Group call support
  isGroupCall?: boolean;
  groupName?: string;
  groupAvatar?: string | null;
  participants?: CallUser[];
}

export type ConnectStage =
  | 'idle'
  | 'requesting-media'   // getUserMedia in flight
  | 'media-ready'        // local camera/mic acquired
  | 'fetching-token'     // negotiating credentials with server
  | 'ringing'            // outbound ring — waiting for answer (P2P)
  | 'signaling'          // P2P SDP exchange / LiveKit signaling
  | 'connecting-media'   // ICE / room connect
  | 'ready';             // fully connected

interface CallStoreState {
  phase: CallPhase;
  call: CallData | null;
  error: string | null;
  connectStage?: ConnectStage;
  /** P2P caller: callee accepted — safe to start WebRTC (Snapchat-style ring-first). */
  remoteAccepted?: boolean;
}

interface CallStoreContextType {
  state: CallStoreState;
  startCall: (params: {
    callType: CallType;
    conversationId: string;
    receiverId: string;
    receiverUsername?: string;
    receiverDisplayName?: string | null;
    receiverAvatarUrl?: string | null;
    isGroupCall?: boolean;
    groupName?: string;
    groupAvatar?: string | null;
    participantIds?: string[];
  }) => Promise<void>;
  acceptCall: (call: CallData) => Promise<void>;
  endCall: () => Promise<void>;
  leaveCall: () => void;
  rejoinCall: () => void;
  setPhase: (phase: CallPhase) => void;
  setConnectStage: (stage: ConnectStage) => void;
  setError: (error: string | null) => void;
  dismissIncoming: () => void;
  switchMode: (mode: CallMode) => Promise<void>;
}

const initialState: CallStoreState = {
  phase: 'idle',
  call: null,
  error: null,
};

// Show browser notification for incoming call
async function showCallNotification(caller: CallUser, callType: CallType, callId: string, isGroupCall?: boolean, groupName?: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  
  const callerName = isGroupCall && groupName 
    ? groupName 
    : (caller.display_name || caller.username || 'Someone');
  const callTypeLabel = callType === 'video' ? '📹 FaceTime' : '📞 Audio';
  
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(`VYBE - Incoming ${callTypeLabel} Call`, {
        body: `${callerName} is calling you`,
        icon: caller.avatar_url || '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag: `vybe-call-${callId}`,
        requireInteraction: true,
        data: { url: '/', type: 'call', callId, callerName, callType },
      });
      return;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CallStore] SW notification failed:', err);
    }
  }
  
  const notification = new Notification(`VYBE - Incoming ${callTypeLabel} Call`, {
    body: `${callerName} is calling you`,
    icon: caller.avatar_url || '/icons/icon-192x192.png',
    tag: 'vybe-incoming-call',
    requireInteraction: true,
  });
  
  notification.onclick = () => { window.focus(); notification.close(); };
  setTimeout(() => notification.close(), 30000);
}

const CallStoreContext = createContext<CallStoreContextType | null>(null);

// Global state outside React for persistence
let globalCallState: CallStoreState = initialState;
let globalIncomingCall: CallData | null = null;
let globalLingeringCall: CallData | null = null;

// ── Auto-reconnect: persistence helpers ───────────────────────
const SNAPSHOT_KEY = 'vybe-active-call';
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;        // 30 min hard cap
const DEFAULT_REJOIN_WINDOW_MS = 60 * 1000;        // 60s for non-persistent calls

interface CallSnapshot {
  callId: string;
  conversationId: string;
  callType: CallType;
  callMode: CallMode;
  isGroupCall?: boolean;
  groupName?: string;
  groupAvatar?: string | null;
  receiver: CallUser;
  caller: CallUser;
  isInitiator: boolean;
  roomName: string;
  startedAt: number;
}

function persistCallSnapshot(call: CallData) {
  try {
    const snap: CallSnapshot = {
      callId: call.id,
      conversationId: call.conversationId,
      callType: call.callType,
      callMode: call.callMode,
      isGroupCall: call.isGroupCall,
      groupName: call.groupName,
      groupAvatar: call.groupAvatar,
      receiver: call.receiver,
      caller: call.caller,
      isInitiator: call.isInitiator,
      roomName: call.roomName,
      startedAt: Date.now(),
    };
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {}
}

function clearCallSnapshot() {
  try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch {}
}

function readCallSnapshot(): CallSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as CallSnapshot;
    if (!snap?.callId || Date.now() - snap.startedAt > SNAPSHOT_MAX_AGE_MS) {
      sessionStorage.removeItem(SNAPSHOT_KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

// Lightweight subscriber registry so non-React readers can react to lingering call changes
const lingeringSubscribers = new Set<() => void>();
function notifyLingeringChange() { lingeringSubscribers.forEach(fn => { try { fn(); } catch {} }); }
function setLingeringCall(call: CallData | null) {
  globalLingeringCall = call;
  notifyLingeringChange();
}
export function subscribeLingeringCall(cb: () => void): () => void {
  lingeringSubscribers.add(cb);
  return () => lingeringSubscribers.delete(cb);
}

export function CallStoreProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  // Bootstrap custom sounds (custom ringtone) into localStorage as soon as user authenticates
  // so incoming-call ringer can use it without opening Settings first.
  useSyncCustomSounds();
  const [state, setStateInternal] = useState<CallStoreState>(() => globalCallState);
  const [incomingCall, setIncomingCallInternal] = useState<CallData | null>(() => globalIncomingCall);
  
  const setState = useCallback((newState: CallStoreState | ((prev: CallStoreState) => CallStoreState)) => {
    setStateInternal(prev => {
      const next = typeof newState === 'function' ? newState(prev) : newState;
      globalCallState = next;
      if (import.meta.env.DEV) console.log('[CallStore] State:', next.phase, '| Mode:', next.call?.callMode || 'none', '| Call:', next.call?.id || 'none');

      // Persist snapshot for refresh-resume; clear on idle/error
      if (next.call && (next.phase === 'joining' || next.phase === 'connected' || next.phase === 'switching')) {
        persistCallSnapshot(next.call);
      } else if (next.phase === 'idle' || next.phase === 'error') {
        clearCallSnapshot();
      }

      return next;
    });
  }, []);
  
  const setIncomingCall = useCallback((call: CallData | null) => {
    globalIncomingCall = call;
    setIncomingCallInternal(call);
  }, []);

  // Process incoming call (shared by realtime + polling)
  const processIncomingCall = useCallback(async (newCall: any) => {
    if (newCall.status !== 'ringing') return;
    if (globalCallState.phase !== 'idle') return;
    if (globalIncomingCall?.id === newCall.id) return;

    if (import.meta.env.DEV) console.log('[CallStore] Incoming call:', newCall.id);

    const [callResult, conversationResult] = await Promise.all([
      db
        .from('calls')
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, display_name, avatar_url),
          receiver:profiles!calls_receiver_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('id', newCall.id)
        .single(),
      db
        .from('conversations')
        .select('id, name, avatar_url, is_group')
        .eq('id', newCall.conversation_id)
        .single()
    ]);

    const data = callResult.data;
    const conversation = conversationResult.data;

    if (data) {
      if (globalCallState.phase !== 'idle' || globalIncomingCall) return;

      const isGroupCall = data.is_group_call || conversation?.is_group || false;
      const groupName = conversation?.name || undefined;
      const groupAvatar = conversation?.avatar_url || null;
      const callMode = (data.call_mode as CallMode) || 'p2p';

      const callData: CallData = {
        id: data.id,
        roomName: data.room_name || '',
        livekitUrl: '',
        token: '',
        callType: data.call_type as CallType,
        callMode,
        conversationId: data.conversation_id,
        caller: data.caller as CallUser,
        receiver: data.receiver as CallUser,
        isInitiator: false,
        isGroupCall,
        groupName,
        groupAvatar,
      };

      setIncomingCall(callData);
      premiumSounds.startRinging();
      showCallNotification(data.caller as CallUser, data.call_type as CallType, data.id, isGroupCall, groupName);
      void presentNativeIncomingCall(callData);
    }
  }, [setIncomingCall]);

  // Surface incoming call when user opens a call push / deep link before poll catches it.
  useEffect(() => {
    const handler = (event: Event) => {
      const call = (event as CustomEvent<CallData>).detail;
      if (!call?.id) return;
      if (globalCallState.phase !== 'idle' || globalIncomingCall) return;
      setIncomingCall(call);
      premiumSounds.startRinging();
      void presentNativeIncomingCall(call);
    };
    window.addEventListener('vybe:incoming-call', handler);
    return () => window.removeEventListener('vybe:incoming-call', handler);
  }, [setIncomingCall]);

  // Realtime + polling for incoming calls
  useEffect(() => {
    if (!profileId) return;

    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastPollTime = new Date().toISOString();
    let isSubscribed = false;

    const channel = subscribePostgresChannel(
      `incoming-calls-${profileId}`,
      [
        {
          event: 'INSERT',
          table: 'calls',
          filter: `receiver_id=eq.${profileId}`,
          callback: (payload) => processIncomingCall(payload.new),
        },
      ],
      (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSubscribed = false;
        }
      },
    );

    const poll = async () => {
      if (globalCallState.phase !== 'idle' || globalIncomingCall) {
        pollTimeoutId = setTimeout(poll, 3000);
        return;
      }

      try {
        const { data: ringingCalls } = await db
          .from('calls')
          .select('id, status, conversation_id, call_type, room_name, created_at')
          .eq('receiver_id', profileId)
          .eq('status', 'ringing')
          .gt('created_at', lastPollTime)
          .order('created_at', { ascending: false })
          .limit(1);

        if (ringingCalls && ringingCalls.length > 0) {
          processIncomingCall(ringingCalls[0]);
        }

        lastPollTime = new Date().toISOString();
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CallStore] Poll error:', err);
      }

      pollTimeoutId = setTimeout(poll, isSubscribed ? 4000 : 1200);
    };

    pollTimeoutId = setTimeout(poll, 2000);

    return () => {
      removeRealtimeChannel(channel);
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    };
  }, [profileId, processIncomingCall]);

  // Caller: track callee accept/decline while P2P connects immediately in parallel.
  useEffect(() => {
    const active = globalCallState.call;
    if (!profileId || !active?.isInitiator || active.callMode !== 'p2p') return;
    if (globalCallState.phase !== 'joining' && globalCallState.phase !== 'creating') return;

    const callId = active.id;
    const channel = subscribePostgresChannel(
      `call-status-${callId}`,
      [
        {
          event: 'UPDATE',
          table: 'calls',
          filter: `id=eq.${callId}`,
          callback: (payload) => {
            const status = (payload.new as { status?: string })?.status;
            if (status === 'accepted') {
              setState((prev) =>
                prev.call?.id === callId ? { ...prev, remoteAccepted: true } : prev,
              );
            } else if (status === 'declined' || status === 'missed' || status === 'ended') {
              premiumSounds.stopAllCallSounds();
              setState(initialState);
            }
          },
        },
      ],
    );

    return () => removeRealtimeChannel(channel);
  }, [profileId, state.phase, state.call?.id, state.call?.isInitiator, state.call?.callMode, setState]);

  // ── AUTO-RECONNECT on page refresh ─────────────────────────
  // If a snapshot exists and the call is still alive in DB, silently rejoin.
  const reconnectAttemptedRef = useRef(false);
  useEffect(() => {
    if (!profileId) return;
    if (reconnectAttemptedRef.current) return;
    if (globalCallState.phase !== 'idle') return;

    const snap = readCallSnapshot();
    if (!snap) return;

    // For non-persistent (default) calls, only resume if refresh was within 60s
    const age = Date.now() - snap.startedAt;
    if (snap.callMode !== 'persistent' && age > DEFAULT_REJOIN_WINDOW_MS) {
      clearCallSnapshot();
      return;
    }

    reconnectAttemptedRef.current = true;

    const tryReconnect = async () => {
      const toastId = toast.loading('Reconnecting to call…');
      const failTimer = setTimeout(() => {
        toast.dismiss(toastId);
        clearCallSnapshot();
      }, 8000);

      try {
        // Verify the call is still active
        const { data: callRow, error: callErr } = await db
          .from('calls')
          .select('id, status, call_mode, call_type, conversation_id, room_name')
          .eq('id', snap.callId)
          .single();

        if (callErr || !callRow || callRow.status === 'ended' || callRow.status === 'declined' || callRow.status === 'missed') {
          clearTimeout(failTimer);
          toast.dismiss(toastId);
          clearCallSnapshot();
          return;
        }

        const mode = (callRow.call_mode as CallMode) || snap.callMode;

        // Get a fresh LiveKit token if persistent
        let token = '';
        let livekitUrl = '';
        let resolvedRoom = callRow.room_name || snap.roomName;
        if (mode === 'persistent') {
          const tokenData = await invokeLiveKitCallToken({
            conversationId: snap.conversationId,
            callType: snap.callType,
            callId: snap.callId,
          });
          token = tokenData.token;
          livekitUrl = tokenData.url;
          resolvedRoom = tokenData.roomName || resolvedRoom;
        }

        const callData: CallData = {
          id: snap.callId,
          roomName: resolvedRoom,
          livekitUrl,
          token,
          callType: snap.callType,
          callMode: mode,
          conversationId: snap.conversationId,
          caller: snap.caller,
          receiver: snap.receiver,
          isInitiator: snap.isInitiator,
          isGroupCall: snap.isGroupCall,
          groupName: snap.groupName,
          groupAvatar: snap.groupAvatar,
        };

        clearTimeout(failTimer);
        toast.dismiss(toastId);
        toast.success('Reconnected', { duration: 1500 });
        setState({ phase: 'joining', call: callData, error: null });
      } catch (err) {
        clearTimeout(failTimer);
        toast.dismiss(toastId);
        clearCallSnapshot();
        if (import.meta.env.DEV) console.warn('[CallStore] Auto-reconnect failed:', err);
      }
    };

    tryReconnect();
  }, [profileId, setState]);

  // Watch the lingering call's status — clear it the moment it actually ends server-side
  // so the green "Rejoin" button never sticks around after a real hangup.
  useEffect(() => {
    if (!profileId) return;
    let channel: ReturnType<typeof db.channel> | null = null;
    let watchedId: string | null = null;

    const attach = (id: string) => {
      if (watchedId === id) return;
      detach();
      watchedId = id;
      channel = subscribePostgresChannel(`lingering-call-${id}`, [
        {
          event: 'UPDATE',
          table: 'calls',
          filter: `id=eq.${id}`,
          callback: (payload) => {
            const s = (payload.new as any)?.status;
            if (s === 'ended' || s === 'declined' || s === 'missed') {
              setLingeringCall(null);
            }
          },
        },
      ]);
    };
    const detach = () => {
      if (channel) { removeRealtimeChannel(channel); channel = null; }
      watchedId = null;
    };

    const sync = () => {
      const id = globalLingeringCall?.id || null;
      if (id) attach(id); else detach();
    };
    sync();
    const unsub = subscribeLingeringCall(sync);
    return () => { unsub(); detach(); };
  }, [profileId]);

  // Listen for call status changes (remote hangup) AND call_mode changes (mode switch)
  useEffect(() => {
    const callId = state.call?.id;
    if (!callId) return;

    const channel = subscribePostgresChannel(`call-status-${callId}`, [
      {
        event: 'UPDATE',
        table: 'calls',
        filter: `id=eq.${callId}`,
        callback: (payload) => {
          const updated = payload.new as any;
          const newStatus = updated.status;
          const newMode = updated.call_mode as CallMode | undefined;

          if (newStatus === 'declined' || newStatus === 'missed') {
            callSounds.end();
            setState(initialState);
          }

          if (newMode && state.call && newMode !== state.call.callMode) {
            if (import.meta.env.DEV) console.log('[CallStore] Remote mode switch detected:', newMode);
            setState(prev => ({
              ...prev,
              phase: 'switching',
              call: prev.call ? { ...prev.call, callMode: newMode } : null,
            }));
          }
        },
      },
    ]);

    return () => { removeRealtimeChannel(channel); };
  }, [state.call?.id, state.call?.callMode, setState]);

  /**
   * START CALL — default to P2P mode
   * For P2P: just insert the call record, no edge function needed
   * The GlobalCallOverlay handles the actual WebRTC connection
   */
  const startCall = useCallback(async (params: {
    callType: CallType;
    conversationId: string;
    receiverId: string;
    receiverUsername?: string;
    receiverDisplayName?: string | null;
    receiverAvatarUrl?: string | null;
    isGroupCall?: boolean;
    groupName?: string;
    groupAvatar?: string | null;
    participantIds?: string[];
  }) => {
    if (!profileId) throw new Error('Not authenticated');
    if (globalCallState.phase !== 'idle') return;

    // Starting a brand-new call — drop any stale lingering rejoin chip
    setLingeringCall(null);
    setState({ phase: 'creating', call: null, error: null, connectStage: 'requesting-media' });
    callSounds.startRingback();

    // CRITICAL: release any preloaded camera stream (Friend Link / preview)
    // before the call requests its own stream. Holding the camera elsewhere
    // makes getUserMedia fail and crashes the call.
    try { stopCameraStream(); } catch {}

    // Pre-warm camera + mic in parallel with DB insert so the moment the
    // overlay mounts, tracks are already live.
    const warmupPromise = warmCallMedia(params.callType).then((s) => {
      if (s) setState((prev) => ({ ...prev, connectStage: 'media-ready' }));
      return s;
    });

    try {
      const roomName = `call-${params.conversationId}`;

      // Group calls REQUIRE persistent (LiveKit) mode — P2P is 1:1 only.
      // Group calling is free for everyone; only 1:1 "Stay-on" persistent mode is Pro.
      const initialMode: CallMode = params.isGroupCall ? 'persistent' : 'p2p';

      // Insert call record directly — P2P doesn't need an edge function
      const { data: callSession, error: callError } = await db
        .from('calls')
        .insert({
          conversation_id: params.conversationId,
          caller_id: profileId,
          receiver_id: params.receiverId,
          call_type: params.callType,
          status: 'ringing',
          room_name: roomName,
          is_group_call: params.isGroupCall || false,
          call_mode: initialMode,
        })
        .select()
        .single();

      if (callError || !callSession) {
        throw new Error(callError?.message || 'Failed to create call');
      }

      // For group calls, fetch a LiveKit token up-front so the caller can join the room
      let livekitUrl = '';
      let token = '';
      let resolvedRoomName = roomName;

      if (initialMode === 'persistent') {
        setState((prev) => ({ ...prev, connectStage: 'fetching-token' }));
        const tokenData = await invokeLiveKitCallToken({
          conversationId: params.conversationId,
          callType: params.callType,
          callId: callSession.id,
        });
        livekitUrl = tokenData.url;
        token = tokenData.token;
        resolvedRoomName = tokenData.roomName || roomName;
      }

      // Make sure media warmup has resolved (or timed out) before flipping to
      // 'joining' so the overlay's first frame already has live tracks.
      try { await Promise.race([warmupPromise, new Promise((r) => setTimeout(r, 1500))]); } catch {}

      const callData: CallData = {
        id: callSession.id,
        roomName: resolvedRoomName,
        livekitUrl,
        token,
        callType: params.callType,
        callMode: initialMode,
        conversationId: params.conversationId,
        caller: {
          id: profileId,
          username: profile?.username || '',
          display_name: profile?.username || '',
          avatar_url: profile?.avatar_url || null,
        },
        receiver: {
          id: params.receiverId,
          username: params.receiverUsername || '',
          display_name: params.receiverDisplayName || null,
          avatar_url: params.receiverAvatarUrl || null,
        },
        isInitiator: true,
        isGroupCall: params.isGroupCall,
        groupName: params.groupName,
        groupAvatar: params.groupAvatar,
      };

      premiumSounds.stopAllCallSounds();
      // Paint the overlay IMMEDIATELY — overlay/camera mount happens here.
      setState({
        phase: 'joining',
        call: callData,
        error: null,
        connectStage: 'signaling',
        remoteAccepted: false,
      });

      // Server-side `onCallCreated` Cloud Function sends high-priority FCM to callee(s).
      // Realtime + polling below remain the in-app fallback.
    } catch (err: any) {
      console.error('[CallStore] Failed to start call:', err);
      premiumSounds.stopAllCallSounds();
      try { clearWarmCallMedia(); } catch {}
      // Reset to idle so the overlay closes and the user can try again
      // instead of being stuck on a black screen requiring a cache clear.
      setState({ phase: 'idle', call: null, error: null });
      try { toast.error(err?.message || 'Failed to start call'); } catch {}
    }
  }, [profileId, profile?.username, profile?.avatar_url, setState]);

  /**
   * ACCEPT CALL
   * For P2P: just update status and join signaling channel
   * For persistent: get LiveKit token
   */
  const acceptCall = useCallback(async (call: CallData) => {
    if (import.meta.env.DEV) console.log('[CallStore] Accepting call:', call.id, 'mode:', call.callMode);
    premiumSounds.stopAllCallSounds();
    setIncomingCall(null);
    void dismissNativeIncomingCall(call.id);

    // Pre-warm camera/mic the instant the user taps Accept so by the time
    // signaling completes, tracks are already live and the in-call UI snaps in.
    try { stopCameraStream(); } catch {}
    const warmupPromise = warmCallMedia(call.callType);

    // Fire-and-forget DB status update — never block the UI on this
    void db
      .from('calls')
      .update({ status: 'accepted', started_at: new Date().toISOString() })
      .eq('id', call.id)
      .then(({ error }) => {
        if (error) console.warn('[CallStore] accept status update failed:', error);
      });

    if (call.callMode === 'persistent') {
      // Flip to 'joining' immediately with media stage so the overlay paints.
      setState({ phase: 'joining', call: { ...call }, error: null, connectStage: 'requesting-media' });
      warmupPromise.then((s) => {
        if (s) setState((prev) => (prev.phase === 'joining' ? { ...prev, connectStage: 'fetching-token' } : prev));
      });
      try {
        const tokenData = await invokeLiveKitCallToken({
          conversationId: call.conversationId,
          callType: call.callType,
          callId: call.id,
        });

        setState(prev => prev.call?.id === call.id
          ? { ...prev, call: { ...prev.call, token: tokenData.token, livekitUrl: tokenData.url, roomName: tokenData.roomName }, connectStage: 'connecting-media' }
          : prev);
      } catch (err: any) {
        console.error('[CallStore] Failed to accept call:', err);
        premiumSounds.stopAllCallSounds();
        setState({ phase: 'error', call: null, error: err.message });
      }
    } else {
      // P2P mode — overlay starts WebRTC the moment we flip phase
      setState({ phase: 'joining', call: { ...call }, error: null, connectStage: 'requesting-media' });
      warmupPromise.then((s) => {
        if (s) setState((prev) => (prev.phase === 'joining' ? { ...prev, connectStage: 'signaling' } : prev));
      });
    }
  }, [setState, setIncomingCall]);

  const endCallRef = useRef(false);
  const endCall = useCallback(async () => {
    // Guard against double execution (e.g. both remote-participant-left + disconnected fire)
    if (endCallRef.current) return;
    endCallRef.current = true;

    premiumSounds.stopAllCallSounds();

    const callId = globalCallState.call?.id || globalLingeringCall?.id;
    if (callId) {
      try {
        await db
          .from('calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', callId);
      } catch (err) {
        console.error('[CallStore] Failed to update call status:', err);
      }
    }

    setLingeringCall(null);
    clearWarmCallMedia();
    callSounds.end();
    setState(initialState);

    // Reset guard after state is cleared
    setTimeout(() => { endCallRef.current = false; }, 100);
  }, [setState]);

  const leaveCall = useCallback(() => {
    premiumSounds.stopAllCallSounds();
    callSounds.end();
    const currentCall = globalCallState.call;
    if (currentCall) {
      // Only allow lingering for persistent mode
      if (currentCall.callMode === 'persistent') {
        setLingeringCall(currentCall);
      }
      setState({ phase: 'idle', call: null, error: null });
    }
  }, [setState]);

  const rejoinCall = useCallback(async () => {
    const lingeringCall = globalLingeringCall;
    if (!lingeringCall) return;
    // Only persistent mode supports rejoin
    if (lingeringCall.callMode !== 'persistent') return;

    setLingeringCall(null);

    try {
      const tokenData = await invokeLiveKitCallToken({
        conversationId: lingeringCall.conversationId,
        callType: lingeringCall.callType,
        callId: lingeringCall.id,
      });

      const callData: CallData = {
        ...lingeringCall,
        token: tokenData.token,
        livekitUrl: tokenData.url,
        roomName: tokenData.roomName,
      };

      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to rejoin:', err);
      setLingeringCall(lingeringCall);
    }
  }, [setState]);

  /**
   * SWITCH MODE — controlled reconnect
   * 1. Update call_mode in DB (triggers Realtime to other client)
   * 2. Set phase to 'switching'
   * 3. GlobalCallOverlay detects 'switching' phase and handles the reconnect
   */
  const switchMode = useCallback(async (mode: CallMode) => {
    const currentCall = globalCallState.call;
    if (!currentCall) return;
    if (currentCall.callMode === mode) return;

    if (import.meta.env.DEV) console.log('[CallStore] Switching mode to:', mode);

    // Update in DB — this triggers Realtime to the other client
    await db
      .from('calls')
      .update({ call_mode: mode })
      .eq('id', currentCall.id);

    // If switching to persistent, get LiveKit token
    if (mode === 'persistent') {
      try {
        const tokenData = await invokeLiveKitCallToken({
          conversationId: currentCall.conversationId,
          callType: currentCall.callType,
          callId: currentCall.id,
        });

        setState(prev => ({
          ...prev,
          phase: 'switching',
          call: prev.call ? {
            ...prev.call,
            callMode: mode,
            token: tokenData.token,
            livekitUrl: tokenData.url,
            roomName: tokenData.roomName,
          } : null,
        }));
      } catch (err: any) {
        console.error('[CallStore] Switch to persistent failed:', err);
        // Revert mode in DB
        await db
          .from('calls')
          .update({ call_mode: currentCall.callMode })
          .eq('id', currentCall.id);
        // Notify user of failure
        setState(prev => ({ ...prev, phase: 'connected' }));
        throw new Error(err?.message || 'Failed to switch to Stay On Call mode');
      }
    } else {
      // Switching to P2P
      setState(prev => ({
        ...prev,
        phase: 'switching',
        call: prev.call ? {
          ...prev.call,
          callMode: mode,
          token: '',
          livekitUrl: '',
        } : null,
      }));
    }
  }, [setState]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState((prev) => ({ ...prev, phase, connectStage: phase === 'connected' ? 'ready' : prev.connectStage }));
  }, [setState]);

  const setConnectStage = useCallback((stage: ConnectStage) => {
    setState((prev) => ({ ...prev, connectStage: stage }));
  }, [setState]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, phase: error ? 'error' : prev.phase }));
  }, [setState]);

  const dismissIncoming = useCallback(async () => {
    premiumSounds.stopAllCallSounds();

    const currentIncoming = globalIncomingCall;
    if (currentIncoming?.id) {
      void dismissNativeIncomingCall(currentIncoming.id);
      await db
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', currentIncoming.id);

      if (currentIncoming.caller?.id && profileId) {
        await db
          .from('notifications')
          .insert({
            user_id: currentIncoming.caller.id,
            actor_id: profileId,
            type: 'missed_call',
          });
      }
    }

    setIncomingCall(null);
  }, [profileId, setIncomingCall]);

  const effectiveState: CallStoreState = incomingCall && state.phase === 'idle'
    ? { phase: 'ringing', call: incomingCall, error: null }
    : state;

  return (
    <CallStoreContext.Provider value={{
      state: effectiveState,
      startCall,
      acceptCall,
      endCall,
      leaveCall,
      rejoinCall,
      setPhase,
      setConnectStage,
      setError,
      dismissIncoming,
      switchMode,
    }}>
      {children}
    </CallStoreContext.Provider>
  );
}

export function useCallStore(): CallStoreContextType {
  const context = useContext(CallStoreContext);
  if (!context) {
    return {
      state: { phase: 'idle', call: null, error: null },
      startCall: async () => {},
      acceptCall: async () => {},
      endCall: async () => {},
      leaveCall: () => {},
      rejoinCall: () => {},
      setPhase: () => {},
      setConnectStage: () => {},
      setError: () => {},
      dismissIncoming: () => {},
      switchMode: async () => {},
    };
  }
  return context;
}

export function getLingeringCall(): CallData | null {
  return globalLingeringCall;
}
