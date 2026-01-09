import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed' | 'busy';

export interface Call {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
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

interface SignalData {
  type: 'offer' | 'answer';
  sdp: string;
}

interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

// Hook to initiate a call
export function useInitiateCall() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      receiverId,
      callType,
    }: {
      conversationId: string;
      receiverId: string;
      callType: CallType;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('calls')
        .insert({
          conversation_id: conversationId,
          caller_id: profile.id,
          receiver_id: receiverId,
          call_type: callType,
          status: 'ringing',
        })
        .select(`
          *,
          caller:profiles!caller_id(id, username, avatar_url, display_name),
          receiver:profiles!receiver_id(id, username, avatar_url, display_name)
        `)
        .single();

      if (error) throw error;
      return data as Call;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start call');
    },
  });
}

// Hook to respond to a call (accept/decline)
export function useRespondToCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      callId,
      response,
    }: {
      callId: string;
      response: 'accepted' | 'declined';
    }) => {
      const updateData: any = { status: response };
      if (response === 'accepted') {
        updateData.started_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('calls')
        .update(updateData)
        .eq('id', callId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
}

// Hook to end a call
export function useEndCall() {
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

// Hook to listen for incoming calls
export function useIncomingCalls() {
  const { profile } = useAuth();
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    // Initial fetch for any ringing calls
    const fetchRingingCalls = async () => {
      const { data } = await supabase
        .from('calls')
        .select(`
          *,
          caller:profiles!caller_id(id, username, avatar_url, display_name),
          receiver:profiles!receiver_id(id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'ringing')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data?.[0]) {
        setIncomingCall(data[0] as Call);
      }
    };

    fetchRingingCalls();

    // Subscribe to call changes
    const channel = supabase
      .channel('incoming-calls')
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
                caller:profiles!caller_id(id, username, avatar_url, display_name),
                receiver:profiles!receiver_id(id, username, avatar_url, display_name)
              `)
              .eq('id', (payload.new as any).id)
              .single();

            if (data) {
              setIncomingCall(data as Call);
            }
          } else if (payload.eventType === 'UPDATE') {
            const newStatus = (payload.new as any).status;
            if (newStatus !== 'ringing') {
              setIncomingCall(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  return { incomingCall, dismissIncomingCall };
}

// Hook for WebRTC call management
export function useWebRTCCall(callId: string | null, isInitiator: boolean) {
  const { profile } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setRemoteStream(null);
    setConnectionState('new');
    pendingCandidatesRef.current = [];
  }, [localStream]);

  const initializeMedia = useCallback(async (callType: CallType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Failed to get media:', error);
      toast.error('Failed to access camera/microphone');
      throw error;
    }
  }, []);

  const createPeerConnection = useCallback((stream: MediaStream, otherUserId: string) => {
    if (!callId || !profile?.id) return null;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await supabase.from('call_signals').insert({
          call_id: callId,
          from_user_id: profile.id,
          to_user_id: otherUserId,
          signal_type: 'ice-candidate',
          signal_data: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [callId, profile?.id]);

  const startCall = useCallback(async (callType: CallType, otherUserId: string) => {
    if (!callId || !profile?.id) return;

    try {
      const stream = await initializeMedia(callType);
      const pc = createPeerConnection(stream, otherUserId);
      if (!pc) return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabase.from('call_signals').insert({
        call_id: callId,
        from_user_id: profile.id,
        to_user_id: otherUserId,
        signal_type: 'offer',
        signal_data: { type: 'offer', sdp: offer.sdp },
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      cleanup();
    }
  }, [callId, profile?.id, initializeMedia, createPeerConnection, cleanup]);

  const answerCall = useCallback(async (callType: CallType, otherUserId: string, offer: RTCSessionDescriptionInit) => {
    if (!callId || !profile?.id) return;

    try {
      const stream = await initializeMedia(callType);
      const pc = createPeerConnection(stream, otherUserId);
      if (!pc) return;

      await pc.setRemoteDescription(offer);

      // Add any pending candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabase.from('call_signals').insert({
        call_id: callId,
        from_user_id: profile.id,
        to_user_id: otherUserId,
        signal_type: 'answer',
        signal_data: { type: 'answer', sdp: answer.sdp },
      });
    } catch (error) {
      console.error('Failed to answer call:', error);
      cleanup();
    }
  }, [callId, profile?.id, initializeMedia, createPeerConnection, cleanup]);

  // Listen for signals
  useEffect(() => {
    if (!callId || !profile?.id) return;

    const channel = supabase
      .channel(`call-signals:${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `call_id=eq.${callId}`,
        },
        async (payload) => {
          const signal = payload.new as any;
          if (signal.to_user_id !== profile.id) return;

          const pc = peerConnectionRef.current;

          if (signal.signal_type === 'offer') {
            // Store offer for answering
            // This will be handled by answerCall
          } else if (signal.signal_type === 'answer' && pc) {
            await pc.setRemoteDescription(signal.signal_data);
            // Add any pending candidates
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
          } else if (signal.signal_type === 'ice-candidate') {
            const candidate = new RTCIceCandidate(signal.signal_data);
            if (pc?.remoteDescription) {
              await pc.addIceCandidate(candidate);
            } else {
              pendingCandidatesRef.current.push(signal.signal_data);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, profile?.id]);

  const toggleMute = useCallback((muted: boolean) => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }, [localStream]);

  const toggleVideo = useCallback((videoOff: boolean) => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !videoOff;
      });
    }
  }, [localStream]);

  return {
    localStream,
    remoteStream,
    connectionState,
    startCall,
    answerCall,
    cleanup,
    toggleMute,
    toggleVideo,
  };
}

// Hook to get active call for a conversation
export function useActiveCall(conversationId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['active-call', conversationId],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;

      const { data, error } = await supabase
        .from('calls')
        .select(`
          *,
          caller:profiles!caller_id(id, username, avatar_url, display_name),
          receiver:profiles!receiver_id(id, username, avatar_url, display_name)
        `)
        .eq('conversation_id', conversationId)
        .in('status', ['ringing', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Call | null;
    },
    enabled: !!conversationId && !!profile?.id,
    refetchInterval: 5000,
  });
}
