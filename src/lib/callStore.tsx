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
function showCallNotification(caller: CallUser, callType: CallType, isGroupCall?: boolean, groupName?: string) {
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
  
  const notification = new Notification(`VYBE - Incoming ${callTypeLabel} Call`, {
    body: `${callerName} is calling you`,
    icon: caller.avatar_url || '/favicon.ico',
    tag: 'vybe-incoming-call',
    requireInteraction: true,
    silent: false, // Let browser play default sound too
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

export function CallStoreProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [state, setState] = useState<CallStoreState>(initialState);
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);

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
          if (state.phase !== 'idle') return; // Already in a call

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
            callSounds.startRinging();
            
            // Show browser notification with VYBE branding
            showCallNotification(data.caller as CallUser, data.call_type as CallType, isGroupCall, groupName);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, state.phase]);

  // Listen for call status changes (remote hangup)
  useEffect(() => {
    if (!state.call?.id) return;

    const channel = supabase
      .channel(`call-status-${state.call.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${state.call.id}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          if (newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed') {
            console.log('[CallStore] Remote call ended:', newStatus);
            callSounds.end();
            setState(initialState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.call?.id]);

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
    if (state.phase !== 'idle') {
      console.warn('[CallStore] Cannot start call, not idle');
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

      // Transition to joining IMMEDIATELY
      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to start call:', err);
      callSounds.stopAll();
      setState({ phase: 'error', call: null, error: err.message });
    }
  }, [profile?.id, state.phase]);

  const acceptCall = useCallback((call: CallData) => {
    console.log('[CallStore] Accepting call:', call.id);
    callSounds.stopAll();
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
  }, []);

  const endCall = useCallback(async () => {
    console.log('[CallStore] Ending call');
    callSounds.stopAll();

    if (state.call?.id) {
      try {
        await supabase
          .from('calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', state.call.id);
      } catch (err) {
        console.error('[CallStore] Failed to update call status:', err);
      }
    }

    callSounds.end();
    setState(initialState);
  }, [state.call?.id]);

  const setPhase = useCallback((phase: CallPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error, phase: error ? 'error' : prev.phase }));
  }, []);

  const dismissIncoming = useCallback(async () => {
    console.log('[CallStore] Dismissing incoming call');
    callSounds.stopAll();

    if (incomingCall?.id) {
      // Update call status to declined
      await supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', incomingCall.id);
      
      console.log('[CallStore] Incoming call declined');
      
      // Create missed call notification for the receiver (current user declined)
      // The caller should be notified that their call was not answered
      if (incomingCall.caller?.id && profile?.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: profile.id,
            actor_id: incomingCall.caller.id,
            type: 'missed_call',
          });
        console.log('[CallStore] Missed call notification created');
      }
    }

    setIncomingCall(null);
  }, [incomingCall?.id, incomingCall?.caller?.id, profile?.id]);

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
