import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, 
  Volume2, VolumeX, Minimize2, Maximize2, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallAvatar } from '@/components/ui/AvatarRing';
import { 
  useGroupCallParticipants, 
  useLeaveGroupCall,
  useUpdateParticipantState,
  useGroupWebRTC,
} from '@/hooks/useGroupCalls';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';
import { cn } from '@/lib/utils';

interface GroupCallUIProps {
  callId: string;
  conversationName: string;
  isVideo: boolean;
  onClose: () => void;
}

export function GroupCallUI({ 
  callId, 
  conversationName, 
  isVideo: initialIsVideo,
  onClose 
}: GroupCallUIProps) {
  const { profile } = useAuth();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(initialIsVideo);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const { data: participants = [] } = useGroupCallParticipants(callId);
  const leaveCall = useLeaveGroupCall();
  const updateState = useUpdateParticipantState();
  
  const {
    localStream,
    peerStreams,
    initMedia,
    startCallWithPeer,
    cleanup,
    toggleMute,
    toggleVideo,
  } = useGroupWebRTC(callId, initialIsVideo);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callStartRef = useRef<number>(Date.now());

  // Initialize media on mount
  useEffect(() => {
    initMedia().then(stream => {
      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    });

    // Play connect sound
    callSounds.connect();

    return () => {
      cleanup();
      callSounds.stopAll();
    };
  }, [initMedia, cleanup]);

  // Connect to new participants
  useEffect(() => {
    if (!localStream) return;

    participants.forEach(p => {
      if (p.user_id !== profile?.id && !peerStreams.has(p.user_id)) {
        startCallWithPeer(p.user_id, localStream);
      }
    });
  }, [participants, localStream, profile?.id, peerStreams, startCallWithPeer]);

  // Call duration timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEndCall = async () => {
    await leaveCall.mutateAsync(callId);
    cleanup();
    onClose();
  };

  const handleToggleMute = () => {
    const newMuted = toggleMute();
    setIsMuted(newMuted);
    updateState.mutate({ callId, is_muted: newMuted });
  };

  const handleToggleVideo = () => {
    const newEnabled = toggleVideo();
    setIsVideoEnabled(newEnabled);
    updateState.mutate({ callId, is_video_enabled: newEnabled });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate grid layout
  const gridCols = useMemo(() => {
    const count = participants.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    return 3;
  }, [participants.length]);

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="fixed bottom-24 right-4 z-50 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
      >
        <div className="flex items-center gap-3 p-3">
          <div className="flex -space-x-2">
            {participants.slice(0, 3).map((p) => (
              <Avatar key={p.id} className="h-8 w-8 border-2 border-card">
                <AvatarImage src={p.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {(p.profile?.display_name || p.profile?.username)?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{conversationName}</p>
            <p className="text-xs text-muted-foreground">{formatDuration(callDuration)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsMinimized(false)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={handleEndCall}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{conversationName}</h2>
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Users className="h-4 w-4" />
              <span>{participants.length} participants</span>
              <span>•</span>
              <span>{formatDuration(callDuration)}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Participants Grid */}
      <div className="absolute inset-0 pt-20 pb-28 px-4">
        {initialIsVideo ? (
          // Video grid
          <div 
            className={cn(
              "h-full grid gap-2",
              gridCols === 1 && "grid-cols-1",
              gridCols === 2 && "grid-cols-2",
              gridCols === 3 && "grid-cols-3"
            )}
          >
            {/* Local video */}
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "w-full h-full object-cover",
                  !isVideoEnabled && "hidden"
                )}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-2xl">
                      {(profile?.username)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/50 text-white text-xs">
                You {isMuted && '(muted)'}
              </div>
            </div>

            {/* Remote videos */}
            {participants
              .filter(p => p.user_id !== profile?.id)
              .map((participant) => {
                const stream = peerStreams.get(participant.user_id);
                
                return (
                  <ParticipantVideo
                    key={participant.id}
                    participant={participant}
                    stream={stream}
                  />
                );
              })}
          </div>
        ) : (
          // Audio call - avatar grid
          <div 
            className={cn(
              "h-full grid gap-4 place-content-center",
              gridCols === 1 && "grid-cols-1",
              gridCols === 2 && "grid-cols-2",
              gridCols === 3 && "grid-cols-3"
            )}
          >
            {participants.map((participant) => (
              <div 
                key={participant.id}
                className="flex flex-col items-center gap-2"
              >
                <CallAvatar
                  src={participant.profile?.avatar_url}
                  fallback={(participant.profile?.display_name || participant.profile?.username)?.[0]?.toUpperCase() || '?'}
                  size="xl"
                  isConnected={true}
                />
                <p className="text-white font-medium text-sm">
                  {(participant.profile as any)?.display_name || participant.profile?.username}
                  {participant.user_id === profile?.id && ' (You)'}
                </p>
                {participant.is_muted && (
                  <MicOff className="h-4 w-4 text-red-400" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-14 w-14 rounded-full",
              isMuted 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-white/20 hover:bg-white/30 text-white"
            )}
            onClick={handleToggleMute}
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>

          {initialIsVideo && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full",
                !isVideoEnabled 
                  ? "bg-red-500 hover:bg-red-600 text-white" 
                  : "bg-white/20 hover:bg-white/30 text-white"
              )}
              onClick={handleToggleVideo}
            >
              {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
            onClick={handleEndCall}
          >
            <PhoneOff className="h-7 w-7" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-14 w-14 rounded-full",
              !isSpeakerOn 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-white/20 hover:bg-white/30 text-white"
            )}
            onClick={() => setIsSpeakerOn(!isSpeakerOn)}
          >
            {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Participant video component
function ParticipantVideo({ 
  participant, 
  stream 
}: { 
  participant: any; 
  stream?: MediaStream;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-muted">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={cn(
          "w-full h-full object-cover",
          (!stream || !participant.is_video_enabled) && "hidden"
        )}
      />
      {(!stream || !participant.is_video_enabled) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Avatar className="h-20 w-20">
            <AvatarImage src={participant.profile?.avatar_url || undefined} />
            <AvatarFallback className="text-2xl">
              {(participant.profile?.display_name || participant.profile?.username)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/50 text-white text-xs flex items-center gap-1">
        {participant.profile?.display_name || participant.profile?.username}
        {participant.is_muted && <MicOff className="h-3 w-3 ml-1" />}
      </div>
    </div>
  );
}
