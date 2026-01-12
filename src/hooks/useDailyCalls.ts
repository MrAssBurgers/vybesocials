import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { callSounds } from '@/lib/callSounds';

export type DailyCallType = 'audio' | 'video';
export type DailyCallStatus = 'pending' | 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';

export interface DailyCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: DailyCallType;
  status: DailyCallStatus;
  room_url: string | null;
  room_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  is_group_call: boolean | null;
  caller?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  receiver?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

// Create a Daily room and call session via edge function
export function useCreateDailyRoom() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      conversationId,
      participants,
    }: {
      type: DailyCallType;
      conversationId: string;
      participants: string[];
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('create-call-room', {
        body: { type, conversationId, participants },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create room');
      }

      return response.data as { roomUrl: string; roomName: string; callId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (error: any) => {
      console.error('Create room error:', error);
      toast.error(error.message || 'Failed to start call');
    },
  });
}

// Send call invite after room creation
export function useSendCallInvite() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      callId,
      receiverId,
    }: {
      callId: string;
      receiverId: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Update call status to ringing
      const { error } = await supabase
        .from('calls')
        .update({ status: 'ringing' })
        .eq('id', callId);

      if (error) throw error;

      return { callId };
    },
  });
}

// Accept call
export function useAcceptDailyCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase
        .from('calls')
        .update({
          status: 'accepted',
          started_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, avatar_url, display_name),
          receiver:profiles!calls_receiver_id_fkey(id, username, avatar_url, display_name)
        `)
        .single();

      if (error) throw error;
      return data as DailyCall;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// Decline call
export function useDeclineDailyCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await supabase
        .from('calls')
        .update({ status: 'declined' })
        .eq('id', callId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// End call
export function useEndDailyCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// Mark call as missed
export function useMarkCallMissed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await supabase
        .from('calls')
        .update({ status: 'missed' })
        .eq('id', callId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// Listen for incoming Daily calls
export function useIncomingDailyCalls() {
  const { profile } = useAuth();
  const [incomingCall, setIncomingCall] = useState<DailyCall | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    // Fetch any existing ringing calls
    const fetchRingingCalls = async () => {
      const { data } = await supabase
        .from('calls')
        .select(`
          *,
          caller:profiles!calls_caller_id_fkey(id, username, avatar_url, display_name),
          receiver:profiles!calls_receiver_id_fkey(id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'ringing')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data?.[0]) {
        setIncomingCall(data[0] as DailyCall);
        startMissedTimeout(data[0].id);
      }
    };

    fetchRingingCalls();

    // Subscribe to call changes
    const channel = supabase
      .channel('daily-incoming-calls')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${profile.id}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' && (payload.new as any).status === 'ringing') {
            // Fetch full call with profiles
            const { data } = await supabase
              .from('calls')
              .select(`
                *,
                caller:profiles!calls_caller_id_fkey(id, username, avatar_url, display_name),
                receiver:profiles!calls_receiver_id_fkey(id, username, avatar_url, display_name)
              `)
              .eq('id', (payload.new as any).id)
              .single();

            if (data) {
              setIncomingCall(data as DailyCall);
              startMissedTimeout(data.id);
            }
          } else if (payload.eventType === 'UPDATE') {
            const newStatus = (payload.new as any).status;
            if (newStatus !== 'ringing' && newStatus !== 'pending') {
              clearMissedTimeout();
              setIncomingCall(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearMissedTimeout();
    };
  }, [profile?.id]);

  const startMissedTimeout = (callId: string) => {
    clearMissedTimeout();
    timeoutRef.current = setTimeout(async () => {
      // Mark as missed after 30 seconds
      await supabase
        .from('calls')
        .update({ status: 'missed' })
        .eq('id', callId)
        .eq('status', 'ringing');
      
      setIncomingCall(null);
    }, 30000);
  };

  const clearMissedTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const dismissIncomingCall = useCallback(() => {
    clearMissedTimeout();
    setIncomingCall(null);
  }, []);

  return { incomingCall, dismissIncomingCall };
}

// Main hook for managing active Daily call
export function useDailyCallState() {
  const { profile } = useAuth();
  const [activeCall, setActiveCall] = useState<DailyCall | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [callPhase, setCallPhase] = useState<'idle' | 'ringing' | 'connecting' | 'connected'>('idle');

  // Listen for call status changes
  useEffect(() => {
    if (!activeCall?.id) return;

    const channel = supabase
      .channel(`daily-call-status:${activeCall.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${activeCall.id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          const newStatus = newData.status;

          if (newStatus === 'accepted') {
            setCallPhase('connecting');
            callSounds.stopAll();
            callSounds.connect();
            // Update activeCall with room info
            setActiveCall(prev => prev ? { ...prev, ...newData } : null);
          } else if (newStatus === 'ended' || newStatus === 'declined' || newStatus === 'missed') {
            callSounds.stopAll();
            callSounds.end();
            setActiveCall(null);
            setCallPhase('idle');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCall?.id]);

  const startCall = useCallback((call: DailyCall, initiator: boolean) => {
    setActiveCall(call);
    setIsInitiator(initiator);
    setCallPhase(initiator ? 'ringing' : 'connecting');
    
    if (initiator) {
      callSounds.startRingback();
    }
  }, []);

  const endCall = useCallback(() => {
    callSounds.stopAll();
    setActiveCall(null);
    setIsInitiator(false);
    setCallPhase('idle');
  }, []);

  const setConnected = useCallback(() => {
    setCallPhase('connected');
  }, []);

  return {
    activeCall,
    isInitiator,
    callPhase,
    startCall,
    endCall,
    setConnected,
  };
}
