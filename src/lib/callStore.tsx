/**
 * Global Call Store
 * 
 * Single source of truth for call state. Event-driven state machine.
 * States: idle → creating → joining → connected → ending → idle
 *         idle → ringing (incoming) → joining → connected → ending → idle
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';

export type CallPhase = 'idle' | 'ringing' | 'creating' | 'joining' | 'connected' | 'ending' | 'error';
export type CallType = 'audio' | 'video';

export interface CallUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CallData {
  id: string;
  roomUrl: string;
  roomName: string;
  callType: CallType;
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

interface CallStoreState {
  phase: CallPhase;
  call: CallData | null;
  error: string | null;
}

interface CallStoreContextType {
  state: CallStoreState;
  startCall: (params: {
    callType: CallType;
    conversationId: string;
    receiverId: string;
    // Receiver profile info for display during call
    receiverUsername?: string;
    receiverDisplayName?: string | null;
    receiverAvatarUrl?: string | null;
    // Group call support
    isGroupCall?: boolean;
    groupName?: string;
    groupAvatar?: string | null;
    participantIds?: string[];
  }) => Promise<void>;
  acceptCall: (call: CallData) => void;
  endCall: () => Promise<void>;
  leaveCall: () => void;
  rejoinCall: () => void;
  setPhase: (phase: CallPhase) => void;
  setError: (error: string | null) => void;
  dismissIncoming: () => void;
}

const initialState: CallStoreState = {
  phase: 'idle',
  call: null,
  error: null,
};

// Show browser notification for incoming call
async function showCallNotification(caller: CallUser, callType: CallType, callId: string, isGroupCall?: boolean, groupName?: string) {
  // Request permission if needed
  if (!('Notification' in window)) return;
  
  // Don't auto-request notification permission — only use it if already granted
  if (Notification.permission !== 'granted') return;
  
  if (Notification.permission !== 'granted') return;
  
  const callerName = isGroupCall && groupName 
    ? groupName 
    : (caller.display_name || caller.username || 'Someone');
  const callTypeLabel = callType === 'video' ? '📹 FaceTime' : '📞 Audio';
  
  // Try to use service worker for better notification handling
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const options: NotificationOptions & { data?: unknown; requireInteraction?: boolean; actions?: Array<{ action: string; title: string }> } = {
        body: `${callerName} is calling you`,
        icon: caller.avatar_url || '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag: `vybe-call-${callId}`,
        requireInteraction: true,
        data: {
          url: '/',
          type: 'call',
          callId,
          callerName,
          callType,
        },
      };
      await registration.showNotification(`VYBE - Incoming ${callTypeLabel} Call`, options);
      return;
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CallStore] SW notification failed, falling back:', err);
    }
  }
  
  // Fallback to standard Notification API
  const notification = new Notification(`VYBE - Incoming ${callTypeLabel} Call`, {
    body: `${callerName} is calling you`,
    icon: caller.avatar_url || '/icons/icon-192x192.png',
    tag: 'vybe-incoming-call',
    requireInteraction: true,
  });
  
  // Focus window when notification clicked
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  
  // Auto-close after 30 seconds
  setTimeout(() => notification.close(), 30000);
}

const CallStoreContext = createContext<CallStoreContextType | null>(null);

// Store state outside of React to prevent resets during navigation/re-renders
let globalCallState: CallStoreState = initialState;
let globalIncomingCall: CallData | null = null;
let globalLingeringCall: CallData | null = null;

export function CallStoreProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  // Initialize from global state to preserve across re-renders
  const [state, setStateInternal] = useState<CallStoreState>(() => globalCallState);
  const [incomingCall, setIncomingCallInternal] = useState<CallData | null>(() => globalIncomingCall);
  
  // Wrapper that also updates global state
  const setState = useCallback((newState: CallStoreState | ((prev: CallStoreState) => CallStoreState)) => {
    setStateInternal(prev => {
      const next = typeof newState === 'function' ? newState(prev) : newState;
      globalCallState = next;
      if (import.meta.env.DEV) console.log('[CallStore] State updated:', next.phase, '| Call ID:', next.call?.id || 'none');
      return next;
    });
  }, []);
  
  const setIncomingCall = useCallback((call: CallData | null) => {
    globalIncomingCall = call;
    setIncomingCallInternal(call);
  }, []);
  // Process an incoming call record (shared by realtime + polling)
  const processIncomingCall = useCallback(async (newCall: any) => {
    if (newCall.status !== 'ringing') return;
    if (globalCallState.phase !== 'idle') return;
    if (globalIncomingCall?.id === newCall.id) return; // Already processing this call

    if (import.meta.env.DEV) console.log('[CallStore] Incoming call detected:', newCall.id);

    const [callResult, conversationResult] = await Promise.all([
      supabase
        .from('calls')
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, display_name, avatar_url),
          receiver:profiles!calls_receiver_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('id', newCall.id)
        .single(),
      supabase
        .from('conversations')
        .select('id, name, avatar_url, is_group')
        .eq('id', newCall.conversation_id)
        .single()
    ]);

    const data = callResult.data;
    const conversation = conversationResult.data;

    if (data && data.room_url) {
      // Double-check we're still idle (async gap)
      if (globalCallState.phase !== 'idle' || globalIncomingCall) return;

      const isGroupCall = data.is_group_call || conversation?.is_group || false;
      const groupName = conversation?.name || undefined;
      const groupAvatar = conversation?.avatar_url || null;

      const callData: CallData = {
        id: data.id,
        roomUrl: data.room_url,
        roomName: data.room_name || '',
        callType: data.call_type as CallType,
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
    }
  }, [setIncomingCall]);

  // Listen for incoming calls via realtime + polling fallback
  useEffect(() => {
    if (!profile?.id) return;

    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastPollTime = new Date().toISOString();
    let isSubscribed = false;

    // Realtime subscription
    const channel = supabase
      .channel(`incoming-calls-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${profile.id}`,
        },
        (payload) => {
          processIncomingCall(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
          if (import.meta.env.DEV) console.log('[CallStore] Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSubscribed = false;
          if (import.meta.env.DEV) console.warn('[CallStore] Realtime subscription error, relying on polling');
        }
      });

    // Polling fallback — catches calls if realtime misses them
    const poll = async () => {
      if (globalCallState.phase !== 'idle' || globalIncomingCall) {
        // Don't poll while in a call or already ringing
        pollTimeoutId = setTimeout(poll, 3000);
        return;
      }

      try {
        const { data: ringingCalls } = await supabase
          .from('calls')
          .select('id, status, conversation_id, call_type, room_url, created_at')
          .eq('receiver_id', profile.id)
          .eq('status', 'ringing')
          .gt('created_at', lastPollTime)
          .order('created_at', { ascending: false })
          .limit(1);

        if (ringingCalls && ringingCalls.length > 0) {
          if (import.meta.env.DEV) console.log('[CallStore] Poll found ringing call:', ringingCalls[0].id);
          processIncomingCall(ringingCalls[0]);
        }

        lastPollTime = new Date().toISOString();
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CallStore] Poll error:', err);
      }

      // Poll every 2s when realtime is down, 5s when it's up
      pollTimeoutId = setTimeout(poll, isSubscribed ? 5000 : 2000);
    };

    // Start polling after a short delay (give realtime a chance first)
    pollTimeoutId = setTimeout(poll, 2000);

    return () => {
      supabase.removeChannel(channel);
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    };
  }, [profile?.id, processIncomingCall]);

  // Listen for call status changes (remote hangup)
  useEffect(() => {
    // Use state.call?.id directly here since we need to subscribe when call exists
    const callId = state.call?.id;
    if (!callId) return;

    if (import.meta.env.DEV) console.log('[CallStore] Subscribing to call status for:', callId);
    
    const channel = supabase
      .channel(`call-status-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          if (import.meta.env.DEV) console.log('[CallStore] Call status update received:', newStatus, 'for call:', callId);
          
          // Don't immediately end the call when remote user ends - let the overlay handle
          // the 8-minute linger. Only end on 'declined' or 'missed' (pre-connect states).
          if (newStatus === 'declined' || newStatus === 'missed') {
            if (import.meta.env.DEV) console.log('[CallStore] Remote call declined/missed:', newStatus);
            callSounds.end();
            setState(initialState);
          }
          // 'ended' status is handled by the overlay's participant-left + 8-min timer
        }
      )
      .subscribe();

    return () => {
      if (import.meta.env.DEV) console.log('[CallStore] Unsubscribing from call status for:', callId);
      supabase.removeChannel(channel);
    };
  }, [state.call?.id, setState]);

  const startCall = useCallback(async (params: {
    callType: CallType;
    conversationId: string;
    receiverId: string;
    // Receiver profile info for display during call
    receiverUsername?: string;
    receiverDisplayName?: string | null;
    receiverAvatarUrl?: string | null;
    // Group call support
    isGroupCall?: boolean;
    groupName?: string;
    groupAvatar?: string | null;
    participantIds?: string[];
  }) => {
    if (!profile?.id) throw new Error('Not authenticated');
    
    // Use global state to avoid stale closure issues
    if (globalCallState.phase !== 'idle') {
      if (import.meta.env.DEV) console.warn('[CallStore] Cannot start call, not idle. Current phase:', globalCallState.phase);
      return;
    }

    if (import.meta.env.DEV) console.log('[CallStore] Starting call:', params);
    setState({ phase: 'creating', call: null, error: null });

    try {
      // For group calls, use all participants; for 1:1, just the receiver
      const allParticipants = params.participantIds && params.participantIds.length > 0
        ? params.participantIds.filter(id => id !== profile.id)
        : [params.receiverId];

      // SPEED OPTIMIZATION: Create room and prepare call data in parallel
      const roomPromise = supabase.functions.invoke('create-call-room', {
        body: {
          type: params.callType,
          conversationId: params.conversationId,
          participants: allParticipants,
        },
      });

      // Start ringback immediately (don't wait for room creation)
      callSounds.startRingback();

      const { data: roomData, error: roomError } = await roomPromise;

      if (roomError || !roomData?.roomUrl) {
        throw new Error(roomError?.message || roomData?.error || 'Failed to create call room');
      }

      if (import.meta.env.DEV) console.log('[CallStore] Room created:', roomData.roomName, 'callId:', roomData.callId);

      // The edge function already created the call record, use its ID
      const callId = roomData.callId;
      if (!callId) {
        throw new Error('No call ID returned from server');
      }

      // Build call data directly without re-fetching profiles (we already have them)
      const callData: CallData = {
        id: callId,
        roomUrl: roomData.roomUrl,
        roomName: roomData.roomName,
        callType: params.callType,
        conversationId: params.conversationId,
        caller: {
          id: profile.id,
          username: profile.username,
          display_name: profile.username, // Use username as display_name fallback
          avatar_url: profile.avatar_url,
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

      // Stop ringback before transitioning to joining - the overlay will handle connected sound
      premiumSounds.stopAllCallSounds();
      
      // Transition to joining IMMEDIATELY
      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to start call:', err);
      premiumSounds.stopAllCallSounds();
      setState({ phase: 'error', call: null, error: err.message });
    }
  }, [profile?.id, profile?.username, profile?.avatar_url, setState]);

  const acceptCall = useCallback((call: CallData) => {
    if (import.meta.env.DEV) console.log('[CallStore] Accepting call:', call.id);
    premiumSounds.stopAllCallSounds();
    setIncomingCall(null);

    // Update call status in DB
    supabase
      .from('calls')
      .update({ status: 'accepted', started_at: new Date().toISOString() })
      .eq('id', call.id)
      .then(() => {
        if (import.meta.env.DEV) console.log('[CallStore] Call status updated to accepted');
      });

    setState({ phase: 'joining', call, error: null });
  }, [setState, setIncomingCall]);

  const endCall = useCallback(async () => {
    if (import.meta.env.DEV) console.log('[CallStore] Ending call - current phase:', globalCallState.phase);
    premiumSounds.stopAllCallSounds();

    // Use global state to get the current call ID (avoids stale closure)
    const callId = globalCallState.call?.id || globalLingeringCall?.id;
    if (callId) {
      try {
        await supabase
          .from('calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', callId);
      } catch (err) {
        console.error('[CallStore] Failed to update call status:', err);
      }
    }

    // Clear lingering call
    globalLingeringCall = null;

    callSounds.end();
    setState(initialState);
  }, [setState]);

  // Leave call locally without ending it in DB — allows rejoin
  const leaveCall = useCallback(() => {
    if (import.meta.env.DEV) console.log('[CallStore] Leaving call locally (not ending)');
    premiumSounds.stopAllCallSounds();
    callSounds.end();
    // Keep call data but set phase to idle so user can rejoin
    const currentCall = globalCallState.call;
    if (currentCall) {
      setState({ phase: 'idle', call: null, error: null });
      // Store the call data globally so rejoin can access it
      globalLingeringCall = currentCall;
    }
  }, [setState]);

  // Rejoin a lingering call
  const rejoinCall = useCallback(() => {
    const lingeringCall = globalLingeringCall;
    if (!lingeringCall) {
      if (import.meta.env.DEV) console.warn('[CallStore] No lingering call to rejoin');
      return;
    }
    if (import.meta.env.DEV) console.log('[CallStore] Rejoining call:', lingeringCall.id);
    globalLingeringCall = null;
    setState({ phase: 'joining', call: lingeringCall, error: null });
  }, [setState]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, [setState]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, phase: error ? 'error' : prev.phase }));
  }, [setState]);

  const dismissIncoming = useCallback(async () => {
    if (import.meta.env.DEV) console.log('[CallStore] Dismissing incoming call');
    premiumSounds.stopAllCallSounds();

    // Use global state to get the incoming call (avoids stale closure)
    const currentIncoming = globalIncomingCall;
    if (currentIncoming?.id) {
      // Update call status to declined
      await supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', currentIncoming.id);
      
      if (import.meta.env.DEV) console.log('[CallStore] Incoming call declined');
      
      // Create missed call notification for the receiver (current user declined)
      if (currentIncoming.caller?.id && profile?.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: profile.id,
            actor_id: currentIncoming.caller.id,
            type: 'missed_call',
          });
        if (import.meta.env.DEV) console.log('[CallStore] Missed call notification created');
      }
    }

    setIncomingCall(null);
  }, [profile?.id, setIncomingCall]);

  // Combine active call state with incoming call for context
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
      setError,
      dismissIncoming,
    }}>
      {children}
    </CallStoreContext.Provider>
  );
}

// Safe hook that returns null if outside provider (prevents crashes during lazy load)
export function useCallStore(): CallStoreContextType {
  const context = useContext(CallStoreContext);
  if (!context) {
    // Return a no-op store for components rendered outside provider
    // This can happen briefly during Suspense/lazy loading
    return {
      state: { phase: 'idle', call: null, error: null },
      startCall: async () => { console.warn('CallStore not ready'); },
      acceptCall: () => {},
      endCall: async () => {},
      leaveCall: () => {},
      rejoinCall: () => {},
      setPhase: () => {},
      setError: () => {},
      dismissIncoming: () => {},
    };
  }
  return context;
}

// Helper to check if there's a lingering call for a specific conversation
export function getLingeringCall(): CallData | null {
  return globalLingeringCall;
}
