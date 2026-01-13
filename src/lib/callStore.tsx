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

          // Fetch full call data with profiles
          const { data } = await supabase
            .from('calls')
            .select(`
              *,
              caller:profiles!calls_caller_id_fkey(id, username, display_name, avatar_url),
              receiver:profiles!calls_receiver_id_fkey(id, username, display_name, avatar_url)
            `)
            .eq('id', newCall.id)
            .single();

          if (data && data.room_url) {
            const callData: CallData = {
              id: data.id,
              roomUrl: data.room_url,
              roomName: data.room_name || '',
              callType: data.call_type as CallType,
              conversationId: data.conversation_id,
              caller: data.caller as CallUser,
              receiver: data.receiver as CallUser,
              isInitiator: false,
            };

            setIncomingCall(callData);
            callSounds.startRinging();
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
  }) => {
    if (!profile?.id) throw new Error('Not authenticated');
    if (state.phase !== 'idle') {
      console.warn('[CallStore] Cannot start call, not idle');
      return;
    }

    console.log('[CallStore] Starting call:', params);
    setState({ phase: 'creating', call: null, error: null });

    try {
      // Create room via edge function
      const { data: roomData, error: roomError } = await supabase.functions.invoke('create-call-room', {
        body: {
          type: params.callType,
          conversationId: params.conversationId,
          participants: [params.receiverId],
        },
      });

      if (roomError || !roomData?.roomUrl) {
        throw new Error(roomError?.message || 'Failed to create call room');
      }

      console.log('[CallStore] Room created:', roomData);

      // Create call record in DB
      const { data: callRecord, error: callError } = await supabase
        .from('calls')
        .insert({
          conversation_id: params.conversationId,
          caller_id: profile.id,
          receiver_id: params.receiverId,
          call_type: params.callType,
          status: 'ringing',
          room_url: roomData.roomUrl,
          room_name: roomData.roomName,
        })
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, display_name, avatar_url),
          receiver:profiles!calls_receiver_id_fkey(id, username, display_name, avatar_url)
        `)
        .single();

      if (callError || !callRecord) {
        throw new Error(callError?.message || 'Failed to create call record');
      }

      console.log('[CallStore] Call record created:', callRecord.id);

      const callData: CallData = {
        id: callRecord.id,
        roomUrl: roomData.roomUrl,
        roomName: roomData.roomName,
        callType: params.callType,
        conversationId: params.conversationId,
        caller: callRecord.caller as CallUser,
        receiver: callRecord.receiver as CallUser,
        isInitiator: true,
      };

      // Start ringback sound for caller
      callSounds.startRingback();

      setState({ phase: 'joining', call: callData, error: null });
    } catch (err: any) {
      console.error('[CallStore] Failed to start call:', err);
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

  const dismissIncoming = useCallback(() => {
    console.log('[CallStore] Dismissing incoming call');
    callSounds.stopAll();

    if (incomingCall?.id) {
      supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', incomingCall.id)
        .then(() => {
          console.log('[CallStore] Incoming call declined');
        });
    }

    setIncomingCall(null);
  }, [incomingCall?.id]);

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

export function useCallStore() {
  const context = useContext(CallStoreContext);
  if (!context) {
    throw new Error('useCallStore must be used within CallStoreProvider');
  }
  return context;
}
