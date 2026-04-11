/**
 * Global Call Store — LiveKit Edition
 * 
 * Single source of truth for call state. Event-driven state machine.
 * States: idle → creating → joining → connected → ending → idle
 *         idle → ringing (incoming) → joining → connected → ending → idle
 * 
 * Room architecture: each conversation has a persistent room (roomName = call-{conversationId}).
 * Users can leave and rejoin the same call. Room is only "ended" when both leave.
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
  roomName: string;
  livekitUrl: string;
  token: string;
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
    receiverUsername?: string;
    receiverDisplayName?: string | null;
    receiverAvatarUrl?: string | null;
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

export function CallStoreProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [state, setStateInternal] = useState<CallStoreState>(() => globalCallState);
  const [incomingCall, setIncomingCallInternal] = useState<CallData | null>(() => globalIncomingCall);
  
  const setState = useCallback((newState: CallStoreState | ((prev: CallStoreState) => CallStoreState)) => {
    setStateInternal(prev => {
      const next = typeof newState === 'function' ? newState(prev) : newState;
      globalCallState = next;
      if (import.meta.env.DEV) console.log('[CallStore] State:', next.phase, '| Call:', next.call?.id || 'none');
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

    if (data && data.room_name) {
      if (globalCallState.phase !== 'idle' || globalIncomingCall) return;

      const isGroupCall = data.is_group_call || conversation?.is_group || false;
      const groupName = conversation?.name || undefined;
      const groupAvatar = conversation?.avatar_url || null;

      const callData: CallData = {
        id: data.id,
        roomName: data.room_name || '',
        livekitUrl: '', // Will be set when accepting
        token: '',      // Will be set when accepting
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

  // Realtime + polling for incoming calls
  useEffect(() => {
    if (!profile?.id) return;

    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastPollTime = new Date().toISOString();
    let isSubscribed = false;

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
        (payload) => processIncomingCall(payload.new)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSubscribed = false;
        }
      });

    const poll = async () => {
      if (globalCallState.phase !== 'idle' || globalIncomingCall) {
        pollTimeoutId = setTimeout(poll, 3000);
        return;
      }

      try {
        const { data: ringingCalls } = await supabase
          .from('calls')
          .select('id, status, conversation_id, call_type, room_name, created_at')
          .eq('receiver_id', profile.id)
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

      pollTimeoutId = setTimeout(poll, isSubscribed ? 5000 : 2000);
    };

    pollTimeoutId = setTimeout(poll, 2000);

    return () => {
      supabase.removeChannel(channel);
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    };
  }, [profile?.id, processIncomingCall]);

  // Listen for call status changes (remote hangup)
  useEffect(() => {
    const callId = state.call?.id;
    if (!callId) return;

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
          if (newStatus === 'declined' || newStatus === 'missed') {
            callSounds.end();
            setState(initialState);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [state.call?.id, setState]);

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
    if (!profile?.id) throw new Error('Not authenticated');
    if (globalCallState.phase !== 'idle') return;

    setState({ phase: 'creating', call: null, error: null });
    callSounds.startRingback();

    try {
      const allParticipants = params.participantIds && params.participantIds.length > 0
        ? params.participantIds.filter(id => id !== profile.id)
        : [params.receiverId];

      // Call our livekit-token edge function to create call + get token
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
        body: {
          conversationId: params.conversationId,
          callType: params.callType,
          receiverId: params.receiverId,
          isGroupCall: params.isGroupCall,
          participantIds: allParticipants,
        },
      });

      if (tokenError || !tokenData?.token) {
        throw new Error(tokenError?.message || tokenData?.error || 'Failed to create call');
      }

      const callData: CallData = {
        id: tokenData.callId,
        roomName: tokenData.roomName,
        livekitUrl: tokenData.url,
        token: tokenData.token,
        callType: params.callType,
        conversationId: params.conversationId,
        caller: {
          id: profile.id,
          username: profile.username,
          display_name: profile.username,
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

      premiumSounds.stopAllCallSounds();
      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to start call:', err);
      premiumSounds.stopAllCallSounds();
      setState({ phase: 'error', call: null, error: err.message });
    }
  }, [profile?.id, profile?.username, profile?.avatar_url, setState]);

  const acceptCall = useCallback(async (call: CallData) => {
    if (import.meta.env.DEV) console.log('[CallStore] Accepting call:', call.id);
    premiumSounds.stopAllCallSounds();
    setIncomingCall(null);

    // Get a token for the accepting user
    try {
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
        body: {
          conversationId: call.conversationId,
          callType: call.callType,
          callId: call.id, // Join existing call
        },
      });

      if (tokenError || !tokenData?.token) {
        throw new Error(tokenError?.message || tokenData?.error || 'Failed to get token');
      }

      // Update call status
      supabase
        .from('calls')
        .update({ status: 'accepted', started_at: new Date().toISOString() })
        .eq('id', call.id)
        .then(() => {});

      const callData: CallData = {
        ...call,
        token: tokenData.token,
        livekitUrl: tokenData.url,
        roomName: tokenData.roomName,
      };

      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to accept call:', err);
      premiumSounds.stopAllCallSounds();
      setState({ phase: 'error', call: null, error: err.message });
    }
  }, [setState, setIncomingCall]);

  const endCall = useCallback(async () => {
    premiumSounds.stopAllCallSounds();

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

    globalLingeringCall = null;
    callSounds.end();
    setState(initialState);
  }, [setState]);

  const leaveCall = useCallback(() => {
    premiumSounds.stopAllCallSounds();
    callSounds.end();
    const currentCall = globalCallState.call;
    if (currentCall) {
      setState({ phase: 'idle', call: null, error: null });
      globalLingeringCall = currentCall;
    }
  }, [setState]);

  const rejoinCall = useCallback(async () => {
    const lingeringCall = globalLingeringCall;
    if (!lingeringCall) return;

    globalLingeringCall = null;

    // Get a fresh token for the rejoin
    try {
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
        body: {
          conversationId: lingeringCall.conversationId,
          callType: lingeringCall.callType,
          callId: lingeringCall.id,
        },
      });

      if (tokenError || !tokenData?.token) {
        throw new Error(tokenError?.message || tokenData?.error || 'Failed to rejoin');
      }

      const callData: CallData = {
        ...lingeringCall,
        token: tokenData.token,
        livekitUrl: tokenData.url,
        roomName: tokenData.roomName,
      };

      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to rejoin:', err);
      globalLingeringCall = lingeringCall; // Restore so user can try again
    }
  }, [setState]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, [setState]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, phase: error ? 'error' : prev.phase }));
  }, [setState]);

  const dismissIncoming = useCallback(async () => {
    premiumSounds.stopAllCallSounds();

    const currentIncoming = globalIncomingCall;
    if (currentIncoming?.id) {
      await supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', currentIncoming.id);

      if (currentIncoming.caller?.id && profile?.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: profile.id,
            actor_id: currentIncoming.caller.id,
            type: 'missed_call',
          });
      }
    }

    setIncomingCall(null);
  }, [profile?.id, setIncomingCall]);

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

export function useCallStore(): CallStoreContextType {
  const context = useContext(CallStoreContext);
  if (!context) {
    return {
      state: { phase: 'idle', call: null, error: null },
      startCall: async () => {},
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

export function getLingeringCall(): CallData | null {
  return globalLingeringCall;
}
