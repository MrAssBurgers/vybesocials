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
  
  if (Notification.permission === 'default') {
    Notification.requestPermission();
    return;
  }
  
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
      console.warn('[CallStore] SW notification failed, falling back:', err);
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
      console.log('[CallStore] State updated:', next.phase, '| Call ID:', next.call?.id || 'none');
      return next;
    });
  }, []);
  
  const setIncomingCall = useCallback((call: CallData | null) => {
    globalIncomingCall = call;
    setIncomingCallInternal(call);
  }, []);
  // Listen for incoming calls
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('incoming-calls-v2')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${profile.id}`,
        },
        async (payload) => {
          const newCall = payload.new as any;
          if (newCall.status !== 'ringing') return;
          
          // Use global state to avoid stale closure - CRITICAL for preventing issues during navigation
          if (globalCallState.phase !== 'idle') {
            console.log('[CallStore] Ignoring incoming call - already in call phase:', globalCallState.phase);
            return;
          }

          console.log('[CallStore] Incoming call detected:', newCall.id);

          // Fetch full call data with profiles and conversation info for group calls
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
            // Use premium sounds which supports custom ringtones
            premiumSounds.startRinging();
            
            // Show browser notification with VYBE branding
            showCallNotification(data.caller as CallUser, data.call_type as CallType, data.id, isGroupCall, groupName);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, setIncomingCall]);

  // Listen for call status changes (remote hangup)
  useEffect(() => {
    // Use state.call?.id directly here since we need to subscribe when call exists
    const callId = state.call?.id;
    if (!callId) return;

    console.log('[CallStore] Subscribing to call status for:', callId);
    
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
          console.log('[CallStore] Call status update received:', newStatus, 'for call:', callId);
          
          if (newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed') {
            console.log('[CallStore] Remote call ended:', newStatus);
            callSounds.end();
            setState(initialState);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[CallStore] Unsubscribing from call status for:', callId);
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
      console.warn('[CallStore] Cannot start call, not idle. Current phase:', globalCallState.phase);
      return;
    }

    console.log('[CallStore] Starting call:', params);
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

      console.log('[CallStore] Room created:', roomData.roomName, 'callId:', roomData.callId);

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
    console.log('[CallStore] Accepting call:', call.id);
    premiumSounds.stopAllCallSounds();
    setIncomingCall(null);

    // Update call status in DB
    supabase
      .from('calls')
      .update({ status: 'accepted', started_at: new Date().toISOString() })
      .eq('id', call.id)
      .then(() => {
        console.log('[CallStore] Call status updated to accepted');
      });

    setState({ phase: 'joining', call, error: null });
  }, [setState, setIncomingCall]);

  const endCall = useCallback(async () => {
    console.log('[CallStore] Ending call - current phase:', globalCallState.phase);
    premiumSounds.stopAllCallSounds();

    // Use global state to get the current call ID (avoids stale closure)
    const callId = globalCallState.call?.id;
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

    callSounds.end();
    setState(initialState);
  }, [setState]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, [setState]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, phase: error ? 'error' : prev.phase }));
  }, [setState]);

  const dismissIncoming = useCallback(async () => {
    console.log('[CallStore] Dismissing incoming call');
    premiumSounds.stopAllCallSounds();

    // Use global state to get the incoming call (avoids stale closure)
    const currentIncoming = globalIncomingCall;
    if (currentIncoming?.id) {
      // Update call status to declined
      await supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', currentIncoming.id);
      
      console.log('[CallStore] Incoming call declined');
      
      // Create missed call notification for the receiver (current user declined)
      if (currentIncoming.caller?.id && profile?.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: profile.id,
            actor_id: currentIncoming.caller.id,
            type: 'missed_call',
          });
        console.log('[CallStore] Missed call notification created');
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
      setPhase: () => {},
      setError: () => {},
      dismissIncoming: () => {},
    };
  }
  return context;
}
