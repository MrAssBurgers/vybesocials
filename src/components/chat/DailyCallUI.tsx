import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DailyIframe from '@daily-co/daily-js';
import { 
  PhoneOff, 
  Mic, 
  MicOff,
  Video,
  VideoOff,
  Minimize2,
  Volume2,
  VolumeX,
  Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { DailyCall, useEndDailyCall } from '@/hooks/useDailyCalls';
import { callSounds } from '@/lib/callSounds';
import { toast } from 'sonner';

interface DailyCallUIProps {
  call: DailyCall;
  isInitiator: boolean;
  callPhase: 'ringing' | 'connecting' | 'connected';
  onClose: () => void;
  onConnected: () => void;
}

export function DailyCallUI({ call, isInitiator, callPhase, onClose, onConnected }: DailyCallUIProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.call_type === 'audio');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [dailyReady, setDailyReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const isInitializedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const joinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onCloseRef = useRef(onClose);
  const onConnectedRef = useRef(onConnected);
  
  const endCallMutation = useEndDailyCall();

  const otherUser = isInitiator ? call.receiver : call.caller;
  const isVideoCall = call.call_type === 'video';
  const isConnected = callPhase === 'connected';
  const isRinging = callPhase === 'ringing';

  // Keep refs updated
  useEffect(() => {
    onCloseRef.current = onClose;
    onConnectedRef.current = onConnected;
  }, [onClose, onConnected]);

  // Clear join timeout helper
  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  // Handle ending the call - stable callback
  const handleEndCall = useCallback(async () => {
    if (isUnmountingRef.current) return;
    isUnmountingRef.current = true;
    
    clearJoinTimeout();
    callSounds.stopAll();
    callSounds.end();
    
    if (dailyRef.current) {
      try {
        await dailyRef.current.leave();
        dailyRef.current.destroy();
        dailyRef.current = null;
      } catch (e) {
        console.error('[DailyCallUI] Error leaving Daily:', e);
      }
    }

    try {
      await endCallMutation.mutateAsync(call.id);
    } catch (e) {
      console.error('[DailyCallUI] Error ending call in DB:', e);
    } finally {
      onCloseRef.current();
    }
  }, [endCallMutation, call.id, clearJoinTimeout]);

  // CRITICAL: Initialize Daily and join IMMEDIATELY when we have a room URL
  useEffect(() => {
    // Only proceed if we're ready to connect (not just ringing)
    if (callPhase === 'ringing') return;
    if (!call.room_url) {
      console.log('[DailyCallUI] No room URL yet, waiting...');
      return;
    }
    if (!containerRef.current) {
      console.log('[DailyCallUI] No container ref yet');
      return;
    }
    // Prevent double initialization
    if (isInitializedRef.current || dailyRef.current) {
      console.log('[DailyCallUI] Already initialized, skipping');
      return;
    }

    isInitializedRef.current = true;
    isUnmountingRef.current = false;

    console.log('[DailyCallUI] Starting Daily initialization with room:', call.room_url);

    const initAndJoin = async () => {
      try {
        // Step 1: Create the Daily call object
        console.log('[DailyCallUI] Creating Daily frame');
        const daily = DailyIframe.createFrame(containerRef.current!, {
          iframeStyle: {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '0',
          },
          showLeaveButton: false,
          showFullscreenButton: false,
        });

        // Store in ref IMMEDIATELY
        dailyRef.current = daily;

        // Step 2: Attach ALL event listeners BEFORE joining
        daily.on('joined-meeting', () => {
          console.log('[DailyCallUI] ✓ joined-meeting event fired');
          clearJoinTimeout();
          if (!isUnmountingRef.current) {
            setDailyReady(true);
            onConnectedRef.current();
            callSounds.stopAll();
            callSounds.connect();
          }
        });

        daily.on('left-meeting', () => {
          console.log('[DailyCallUI] left-meeting event fired');
        });

        daily.on('error', (event) => {
          console.error('[DailyCallUI] Daily error:', event);
          clearJoinTimeout();
          if (!isUnmountingRef.current) {
            toast.error('Call connection error');
          }
        });

        daily.on('participant-joined', (event) => {
          console.log('[DailyCallUI] Participant joined:', event?.participant?.user_id);
        });

        // Step 3: Set up FAILSAFE TIMEOUT (15 seconds)
        joinTimeoutRef.current = setTimeout(() => {
          console.error('[DailyCallUI] Join timeout - call failed to connect');
          if (!isUnmountingRef.current && dailyRef.current && !dailyReady) {
            toast.error('Call failed to connect');
            handleEndCall();
          }
        }, 15000);

        // Step 4: IMMEDIATELY call join
        console.log('[DailyCallUI] Calling daily.join() with URL:', call.room_url);
        await daily.join({
          url: call.room_url!,
          startVideoOff: call.call_type === 'audio',
          startAudioOff: false,
        });
        console.log('[DailyCallUI] daily.join() completed');

      } catch (error) {
        console.error('[DailyCallUI] Failed to join Daily room:', error);
        clearJoinTimeout();
        isInitializedRef.current = false;
        if (!isUnmountingRef.current) {
          toast.error('Failed to join call');
          handleEndCall();
        }
      }
    };

    // Execute immediately - no delays
    initAndJoin();

    // Cleanup on unmount
    return () => {
      console.log('[DailyCallUI] Component unmounting');
      isUnmountingRef.current = true;
      clearJoinTimeout();
      
      if (dailyRef.current) {
        try {
          dailyRef.current.leave().catch(() => {});
          dailyRef.current.destroy();
        } catch (e) {
          console.error('[DailyCallUI] Cleanup error:', e);
        }
        dailyRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [call.room_url, callPhase, call.call_type, clearJoinTimeout, handleEndCall]);

  // Call duration timer
  useEffect(() => {
    if (!dailyReady) return;

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [dailyReady]);

  const handleToggleMute = useCallback(() => {
    if (dailyRef.current && dailyReady) {
      const newMuted = !isMuted;
      dailyRef.current.setLocalAudio(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted, dailyReady]);

  const handleToggleVideo = useCallback(() => {
    if (dailyRef.current && isVideoCall && dailyReady) {
      const newVideoOff = !isVideoOff;
      dailyRef.current.setLocalVideo(!newVideoOff);
      setIsVideoOff(newVideoOff);
    }
  }, [isVideoOff, isVideoCall, dailyReady]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    if (isRinging) return isInitiator ? 'Ringing...' : 'Connecting...';
    if (!dailyReady) return 'Connecting...';
    return formatDuration(callDuration);
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
        className="fixed bottom-24 right-4 z-[9999] bg-card/95 backdrop-blur-lg border border-border rounded-2xl p-3 shadow-2xl cursor-pointer"
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
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
    >
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
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
              animate={!dailyReady ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ repeat: !dailyReady ? Infinity : 0, duration: 1.5 }}
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

      {/* Main content - Daily iframe or ringing UI */}
      <div className="flex-1 relative overflow-hidden bg-black" ref={containerRef}>
        {/* Show ringing/connecting UI when not yet connected */}
        {!dailyReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/50 via-black to-black/50 z-10">
            {isRinging && <RingingPulse />}
            <motion.div 
              className="text-center z-10"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
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
      </div>

      {/* Controls */}
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="absolute bottom-0 left-0 right-0 p-5 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent z-20"
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
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            >
              {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>
          </motion.div>

          {/* End call */}
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
