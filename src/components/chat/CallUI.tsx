import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff,
  Minimize2,
  Volume2,
  VolumeX,
  SwitchCamera,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Call, useWebRTCCall, useEndCall } from '@/hooks/useCalls';
import { supabase } from '@/integrations/supabase/client';

interface CallUIProps {
  call: Call;
  isInitiator: boolean;
  onClose: () => void;
}

export function CallUI({ call, isInitiator, onClose }: CallUIProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const hasInitialized = useRef(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const endCallMutation = useEndCall();
  const {
    localStream,
    remoteStream,
    connectionState,
    callEnded,
    startCall,
    answerCall,
    cleanup,
    toggleMute,
    toggleVideo,
  } = useWebRTCCall(call.id, isInitiator);

  const otherUser = isInitiator ? call.receiver : call.caller;
  const isVideoCall = call.call_type === 'video';
  const isConnected = call.status === 'accepted' && (connectionState === 'connected' || connectionState === 'connecting');
  const isRinging = call.status === 'ringing';

  // Handle call ended by other party via realtime subscription
  useEffect(() => {
    if (callEnded) {
      console.log('Call ended detected, closing UI...');
      onClose();
    }
  }, [callEnded, onClose]);

  // Start the call when component mounts (for initiator) or answer (for receiver)
  useEffect(() => {
    if (hasInitialized.current) return;
    
    const initCall = async () => {
      hasInitialized.current = true;
      
      if (isInitiator && call.status === 'ringing') {
        startCall(call.call_type, call.receiver_id);
      } else if (!isInitiator && call.status === 'accepted') {
        // Receiver needs to get the offer and answer
        const { data: signals } = await supabase
          .from('call_signals')
          .select('*')
          .eq('call_id', call.id)
          .eq('signal_type', 'offer')
          .order('created_at', { ascending: false })
          .limit(1);

        if (signals?.[0]) {
          const offer = signals[0].signal_data as { type: 'offer'; sdp: string };
          answerCall(call.call_type, call.caller_id, { type: 'offer', sdp: offer.sdp });
        }
      }
    };
    
    initCall();
  }, [isInitiator, call.status, call.call_type, call.receiver_id, call.caller_id, call.id, startCall, answerCall]);

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

  const handleEndCall = useCallback(async () => {
    try {
      await endCallMutation.mutateAsync(call.id);
    } finally {
      cleanup();
      onClose();
    }
  }, [endCallMutation, call.id, cleanup, onClose]);

  const handleToggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    toggleMute(newMuted);
  }, [isMuted, toggleMute]);

  const handleToggleVideo = useCallback(() => {
    const newVideoOff = !isVideoOff;
    setIsVideoOff(newVideoOff);
    toggleVideo(newVideoOff);
  }, [isVideoOff, toggleVideo]);

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerOn(!isSpeakerOn);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = isSpeakerOn;
    }
  }, [isSpeakerOn]);

  const handleFlipCamera = useCallback(async () => {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const newFacing = isFrontCamera ? 'environment' : 'user';
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: false,
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      // Replace track in stream
      localStream.removeTrack(videoTrack);
      videoTrack.stop();
      localStream.addTrack(newVideoTrack);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      
      setIsFrontCamera(!isFrontCamera);
    } catch (error) {
      console.error('Failed to flip camera:', error);
    }
  }, [localStream, isFrontCamera]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status text
  const getStatusText = () => {
    if (isRinging) return isInitiator ? 'Ringing...' : 'Connecting...';
    if (call.status === 'accepted') {
      if (connectionState === 'connecting' || connectionState === 'new') return 'Connecting...';
      if (connectionState === 'connected') return formatDuration(callDuration);
      if (connectionState === 'failed') return 'Connection failed';
      if (connectionState === 'disconnected') return 'Reconnecting...';
    }
    return '';
  };

  // Ringing pulse animation
  const RingingPulse = () => (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-primary/40"
          initial={{ width: 140, height: 140, opacity: 0.6 }}
          animate={{ 
            width: [140, 280], 
            height: [140, 280], 
            opacity: [0.5, 0] 
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );

  // Minimized view
  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 100 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 100 }}
        className="fixed bottom-24 right-4 z-50 bg-card/95 backdrop-blur-lg border border-border rounded-2xl p-3 shadow-2xl cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-green-500/50">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <motion.div 
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-card"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{otherUser?.display_name || otherUser?.username}</span>
            <span className="text-xs text-green-500 font-medium">{getStatusText()}</span>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full hover:bg-muted" 
              onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="destructive" 
              size="icon" 
              className="h-8 w-8 rounded-full" 
              onClick={(e) => { e.stopPropagation(); handleEndCall(); }}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={isRinging ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: isRinging ? Infinity : 0, duration: 1 }}
          >
            <Avatar className="h-11 w-11 ring-2 ring-white/20">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="text-base font-semibold bg-primary/30">
                {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <div>
            <h3 className="text-white font-semibold">{otherUser?.display_name || otherUser?.username}</h3>
            <motion.p 
              className="text-white/60 text-sm"
              animate={isRinging ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ repeat: isRinging ? Infinity : 0, duration: 1.5 }}
            >
              {getStatusText()}
            </motion.p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 rounded-full h-10 w-10"
          onClick={() => setIsMinimized(true)}
        >
          <Minimize2 className="h-5 w-5" />
        </Button>
      </motion.div>

      {/* Main content area */}
      {isVideoCall ? (
        <div className="flex-1 relative overflow-hidden bg-black">
          {/* Remote video (full screen) */}
          <AnimatePresence>
            {remoteStream && (
              <motion.video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </AnimatePresence>
          
          {/* Ringing/connecting state */}
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/50 via-black to-black/50">
              {isRinging && <RingingPulse />}
              <motion.div 
                className="text-center z-10"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <motion.div
                  animate={isRinging ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: isRinging ? Infinity : 0, duration: 2 }}
                >
                  <Avatar className="h-28 w-28 mx-auto mb-4 ring-4 ring-white/10 shadow-2xl">
                    <AvatarImage src={otherUser?.avatar_url || undefined} />
                    <AvatarFallback className="text-4xl font-semibold bg-gradient-to-br from-primary/50 to-primary/20">
                      {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <motion.p 
                  className="text-white/70 text-base font-medium"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  {getStatusText()}
                </motion.p>
              </motion.div>
            </div>
          )}
          
          {/* Local video PiP */}
          <motion.div
            drag
            dragMomentum={false}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute top-20 right-3 w-24 h-32 md:w-32 md:h-44 rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black/50"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover scale-x-[-1]",
                isVideoOff && "hidden"
              )}
            />
            {isVideoOff && (
              <div className="w-full h-full bg-muted/90 flex items-center justify-center">
                <VideoOff className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        /* Audio call UI */
        <div className="flex-1 flex items-center justify-center relative bg-gradient-to-b from-black via-zinc-900 to-black">
          {isRinging && <RingingPulse />}
          <motion.div 
            className="text-center z-10 px-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <motion.div
              animate={isRinging ? { scale: [1, 1.06, 1] } : {}}
              transition={{ repeat: isRinging ? Infinity : 0, duration: 1.5, ease: "easeInOut" }}
            >
              <Avatar className="h-36 w-36 mx-auto mb-6 ring-4 ring-white/10 shadow-2xl">
                <AvatarImage src={otherUser?.avatar_url || undefined} />
                <AvatarFallback className="text-5xl font-semibold bg-gradient-to-br from-primary/50 to-primary/20">
                  {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <h2 className="text-white text-2xl font-semibold mb-1">
              {otherUser?.display_name || otherUser?.username}
            </h2>
            <motion.p 
              className="text-white/60 text-lg"
              animate={isRinging ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ repeat: isRinging ? Infinity : 0, duration: 1.5 }}
            >
              {getStatusText()}
            </motion.p>
            
            {/* Encrypted indicator */}
            <motion.div 
              className="mt-6 flex items-center justify-center gap-2 text-white/40 text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span>End-to-end encrypted</span>
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* Controls */}
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="absolute bottom-0 left-0 right-0 p-5 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent"
      >
        <div className="flex items-center justify-center gap-4">
          {/* Mute */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full transition-colors",
                isMuted 
                  ? "bg-white text-black hover:bg-white/90" 
                  : "bg-white/15 text-white hover:bg-white/25"
              )}
              onClick={handleToggleMute}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
          </motion.div>

          {/* Video toggle */}
          {isVideoCall && (
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-14 w-14 rounded-full transition-colors",
                  isVideoOff 
                    ? "bg-white text-black hover:bg-white/90" 
                    : "bg-white/15 text-white hover:bg-white/25"
                )}
                onClick={handleToggleVideo}
              >
                {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            </motion.div>
          )}

          {/* End call */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/25"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </motion.div>

          {/* Speaker */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full transition-colors",
                !isSpeakerOn 
                  ? "bg-white text-black hover:bg-white/90" 
                  : "bg-white/15 text-white hover:bg-white/25"
              )}
              onClick={handleToggleSpeaker}
            >
              {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>
          </motion.div>

          {/* Flip camera */}
          {isVideoCall && (
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
              <Button
                variant="ghost"
                size="icon"
                className="h-14 w-14 rounded-full bg-white/15 text-white hover:bg-white/25"
                onClick={handleFlipCamera}
              >
                <SwitchCamera className="h-6 w-6" />
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
