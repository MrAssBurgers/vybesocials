import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { callSounds } from '@/lib/callSounds';

export interface GroupCallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_muted: boolean;
  is_video_enabled: boolean;
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  stream?: MediaStream;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export function useGroupCallParticipants(callId: string | undefined) {
  return useQuery({
    queryKey: ['group-call-participants', callId],
    queryFn: async () => {
      if (!callId) return [];
      
      const { data, error } = await supabase
        .from('group_call_participants')
        .select(`
          *,
          profile:profiles(id, username, display_name, avatar_url)
        `)
        .eq('call_id', callId)
        .is('left_at', null);
      
      if (error) throw error;
      return data as GroupCallParticipant[];
    },
    enabled: !!callId,
    refetchInterval: 3000,
  });
}

export function useStartGroupCall() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      callType 
    }: { 
      conversationId: string; 
      callType: 'audio' | 'video';
    }) => {
      if (!profile?.id) throw new Error('Must be logged in');

      // Create the call record
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          conversation_id: conversationId,
          caller_id: profile.id,
          receiver_id: profile.id, // For group calls, set to self
          call_type: callType,
          status: 'ringing',
          is_group_call: true,
        })
        .select()
        .single();

      if (callError) throw callError;

      // Add the caller as first participant
      const { error: participantError } = await supabase
        .from('group_call_participants')
        .insert({
          call_id: call.id,
          user_id: profile.id,
          is_video_enabled: callType === 'video',
        });

      if (participantError) throw participantError;

      return call;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-call'] });
    },
    onError: (error) => {
      toast.error('Failed to start call');
      console.error('Start group call error:', error);
    },
  });
}

export function useJoinGroupCall() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      callId, 
      isVideo 
    }: { 
      callId: string; 
      isVideo: boolean;
    }) => {
      if (!profile?.id) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('group_call_participants')
        .insert({
          call_id: callId,
          user_id: profile.id,
          is_video_enabled: isVideo,
        });

      if (error) throw error;

      // Update call status to accepted if still ringing
      await supabase
        .from('calls')
        .update({ status: 'accepted', started_at: new Date().toISOString() })
        .eq('id', callId)
        .eq('status', 'ringing');
    },
    onSuccess: (_, { callId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-call-participants', callId] });
      callSounds.connect();
    },
    onError: () => {
      toast.error('Failed to join call');
    },
  });
}

export function useLeaveGroupCall() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (callId: string) => {
      if (!profile?.id) throw new Error('Must be logged in');

      // Mark participant as left
      const { error } = await supabase
        .from('group_call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', callId)
        .eq('user_id', profile.id);

      if (error) throw error;

      // Check if any participants remain
      const { data: remaining } = await supabase
        .from('group_call_participants')
        .select('id')
        .eq('call_id', callId)
        .is('left_at', null);

      // If no one left, end the call
      if (!remaining || remaining.length === 0) {
        await supabase
          .from('calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', callId);
      }
    },
    onSuccess: (_, callId) => {
      queryClient.invalidateQueries({ queryKey: ['group-call-participants', callId] });
      callSounds.end();
    },
    onError: () => {
      toast.error('Failed to leave call');
    },
  });
}

export function useUpdateParticipantState() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      callId, 
      is_muted, 
      is_video_enabled 
    }: { 
      callId: string; 
      is_muted?: boolean; 
      is_video_enabled?: boolean;
    }) => {
      if (!profile?.id) throw new Error('Must be logged in');

      const updates: Record<string, any> = {};
      if (is_muted !== undefined) updates.is_muted = is_muted;
      if (is_video_enabled !== undefined) updates.is_video_enabled = is_video_enabled;

      const { error } = await supabase
        .from('group_call_participants')
        .update(updates)
        .eq('call_id', callId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: (_, { callId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-call-participants', callId] });
    },
  });
}

// Multi-peer WebRTC hook for group calls
export function useGroupWebRTC(callId: string | null, isVideo: boolean) {
  const { profile } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [connectionStates, setConnectionStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initialize local media
  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo,
      });
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Failed to get media:', error);
      toast.error('Failed to access camera/microphone');
      return null;
    }
  }, [isVideo]);

  // Create peer connection for a specific user
  const createPeerConnection = useCallback((peerId: string, localStream: MediaStream) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    
    // Add local tracks
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      setPeerStreams(prev => {
        const next = new Map(prev);
        next.set(peerId, event.streams[0]);
        return next;
      });
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      setConnectionStates(prev => {
        const next = new Map(prev);
        next.set(peerId, pc.connectionState);
        return next;
      });

      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Clean up failed connection
        pc.close();
        peerConnections.current.delete(peerId);
        setPeerStreams(prev => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && callId && profile?.id) {
        const candidateJson = event.candidate.toJSON();
        const signalData = {
          candidate: candidateJson.candidate || null,
          sdpMid: candidateJson.sdpMid || null,
          sdpMLineIndex: candidateJson.sdpMLineIndex ?? null,
        };
        supabase.from('call_signals').insert([{
          call_id: callId,
          from_user_id: profile.id,
          to_user_id: peerId,
          signal_type: 'ice-candidate',
          signal_data: signalData,
        }]);
      }
    };

    peerConnections.current.set(peerId, pc);
    return pc;
  }, [callId, profile?.id]);

  // Start call with a peer
  const startCallWithPeer = useCallback(async (peerId: string, localStream: MediaStream) => {
    const pc = createPeerConnection(peerId, localStream);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (callId && profile?.id) {
        await supabase.from('call_signals').insert({
          call_id: callId,
          from_user_id: profile.id,
          to_user_id: peerId,
          signal_type: 'offer',
          signal_data: { sdp: offer.sdp, type: offer.type },
        });
      }
    } catch (error) {
      console.error('Failed to create offer:', error);
    }
  }, [callId, profile?.id, createPeerConnection]);

  // Handle incoming signal
  const handleSignal = useCallback(async (signal: any, localStream: MediaStream) => {
    const { from_user_id, signal_type, signal_data } = signal;

    let pc = peerConnections.current.get(from_user_id);

    if (signal_type === 'offer') {
      if (!pc) {
        pc = createPeerConnection(from_user_id, localStream);
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (callId && profile?.id) {
        await supabase.from('call_signals').insert({
          call_id: callId,
          from_user_id: profile.id,
          to_user_id: from_user_id,
          signal_type: 'answer',
          signal_data: { sdp: answer.sdp, type: answer.type },
        });
      }
    } else if (signal_type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
    } else if (signal_type === 'ice-candidate' && pc) {
      await pc.addIceCandidate(new RTCIceCandidate(signal_data));
    }
  }, [callId, profile?.id, createPeerConnection]);

  // Subscribe to signals
  useEffect(() => {
    if (!callId || !profile?.id || !localStream) return;

    signalChannel.current = supabase
      .channel(`group-call-signals:${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `call_id=eq.${callId}`,
        },
        (payload) => {
          const signal = payload.new as any;
          if (signal.to_user_id === profile.id) {
            handleSignal(signal, localStream);
          }
        }
      )
      .subscribe();

    return () => {
      if (signalChannel.current) {
        supabase.removeChannel(signalChannel.current);
      }
    };
  }, [callId, profile?.id, localStream, handleSignal]);

  // Cleanup
  const cleanup = useCallback(() => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    
    setPeerStreams(new Map());
    setConnectionStates(new Map());
  }, [localStream]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  return {
    localStream,
    peerStreams,
    connectionStates,
    initMedia,
    startCallWithPeer,
    cleanup,
    toggleMute,
    toggleVideo,
  };
}
