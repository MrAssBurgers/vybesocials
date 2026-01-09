import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Call, useWebRTCCall, useEndCall } from '@/hooks/useCalls';

interface CallUIProps {
  call: Call;
  isInitiator: boolean;
  onClose: () => void;
}

export function CallUI({ call, isInitiator, onClose }: CallUIProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const endCall = useEndCall();
  const {
    localStream,
    remoteStream,
    connectionState,
    startCall,
    cleanup,
    toggleMute,
    toggleVideo,
  } = useWebRTCCall(call.id, isInitiator);

  const otherUser = isInitiator ? call.receiver : call.caller;
  const isVideoCall = call.call_type === 'video';

  // Start the call when component mounts (for initiator)
  useEffect(() => {
    if (isInitiator && call.status === 'ringing') {
      const receiverId = call.receiver_id;
      startCall(call.call_type, receiverId);
    }
  }, [isInitiator, call.status, call.call_type, call.receiver_id, startCall]);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (call.status !== 'accepted') return;

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [call.status]);

  // Handle call status changes
  useEffect(() => {
    if (call.status === 'ended' || call.status === 'declined') {
      cleanup();
      onClose();
    }
  }, [call.status, cleanup, onClose]);

  const handleEndCall = async () => {
    await endCall.mutateAsync(call.id);
    cleanup();
    onClose();
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    toggleMute(!isMuted);
  };

  const handleToggleVideo = () => {
    setIsVideoOff(!isVideoOff);
    toggleVideo(!isVideoOff);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-20 right-4 z-50 bg-card border border-border rounded-full p-3 shadow-lg cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-10 w-10">
            <AvatarImage src={otherUser?.avatar_url || undefined} />
            <AvatarFallback>{otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{otherUser?.display_name || otherUser?.username}</span>
            <span className="text-xs text-green-500">{formatDuration(callDuration)}</span>
          </div>
          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleEndCall(); }}>
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
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-white/20">
            <AvatarImage src={otherUser?.avatar_url || undefined} />
            <AvatarFallback>{otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-white font-semibold">{otherUser?.display_name || otherUser?.username}</h3>
            <p className="text-white/60 text-sm">
              {call.status === 'ringing' && (isInitiator ? 'Calling...' : 'Incoming call')}
              {call.status === 'accepted' && formatDuration(callDuration)}
              {connectionState === 'connecting' && 'Connecting...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Video container */}
      {isVideoCall ? (
        <div className="flex-1 relative">
          {/* Remote video (full screen) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Local video (picture-in-picture) */}
          <motion.div
            drag
            dragMomentum={false}
            className="absolute bottom-24 right-4 w-32 h-44 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                isVideoOff && "hidden"
              )}
            />
            {isVideoOff && (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <VideoOff className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </motion.div>

          {/* No remote video placeholder */}
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Avatar className="h-24 w-24 mx-auto mb-4">
                  <AvatarImage src={otherUser?.avatar_url || undefined} />
                  <AvatarFallback className="text-3xl">
                    {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-white/60">
                  {call.status === 'ringing' ? 'Waiting for answer...' : 'Connecting video...'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Audio call UI */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <motion.div
              animate={{ scale: call.status === 'ringing' ? [1, 1.1, 1] : 1 }}
              transition={{ repeat: call.status === 'ringing' ? Infinity : 0, duration: 1.5 }}
            >
              <Avatar className="h-32 w-32 mx-auto mb-6 ring-4 ring-white/20">
                <AvatarImage src={otherUser?.avatar_url || undefined} />
                <AvatarFallback className="text-4xl">
                  {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <h2 className="text-white text-2xl font-semibold mb-2">
              {otherUser?.display_name || otherUser?.username}
            </h2>
            <p className="text-white/60">
              {call.status === 'ringing' && (isInitiator ? 'Calling...' : 'Incoming call')}
              {call.status === 'accepted' && formatDuration(callDuration)}
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6">
        <div className="flex items-center justify-center gap-4">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full",
                isMuted ? "bg-red-500/20 text-red-500" : "bg-white/10 text-white"
              )}
              onClick={handleToggleMute}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
          </motion.div>

          {isVideoCall && (
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-14 w-14 rounded-full",
                  isVideoOff ? "bg-red-500/20 text-red-500" : "bg-white/10 text-white"
                )}
                onClick={handleToggleVideo}
              >
                {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            </motion.div>
          )}

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
