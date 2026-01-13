/**
 * Global Call Overlay
 * 
 * Simplified approach: when you click "Join", you immediately enter
 * a waiting room and wait up to 30 seconds for the other person.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions, isAndroid, nextAnimationFrame } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { supabase } from '@/integrations/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';

// Module-level state
let globalDailyInstance: DailyCall | null = null;
let globalListenersAttached = false;

function cleanupOrphanedIframes() {
  if (typeof document === 'undefined') return;
  const iframes = document.querySelectorAll('iframe[allow*="camera"], iframe[title*="daily"]');
  iframes.forEach(iframe => {
    console.log('[CallOverlay] Removing orphaned iframe');
    iframe.remove();
  });
}

function destroyDailyInstance() {
  if (globalDailyInstance) {
    try {
      console.log('[CallOverlay] Destroying Daily instance');
      globalDailyInstance.destroy();
    } catch (err) {
      console.warn('[CallOverlay] Error destroying Daily:', err);
    }
    globalDailyInstance = null;
    globalListenersAttached = false;
  }
  cleanupOrphanedIframes();
}

function createFreshDailyInstance(container: HTMLDivElement, roomUrl: string): DailyCall | null {
  destroyDailyInstance();

  try {
    console.log('[CallOverlay] Creating fresh Daily instance');
    const daily = DailyIframe.createFrame(container, {
      url: roomUrl,
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
      },
      showLeaveButton: false,
      showFullscreenButton: true,
      startAudioOff: true,
      startVideoOff: true,
    });

    globalDailyInstance = daily;
    globalListenersAttached = false;
    console.log('[CallOverlay] Daily instance created successfully');
    return daily;
  } catch (err) {
    console.error('[CallOverlay] Failed to create Daily iframe:', err);
    cleanupOrphanedIframes();
    return null;
  }
}

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, setPhase, setError, dismissIncoming } = useCallStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const isLeavingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinStartedRef = useRef<string | null>(null);
  
  // UI state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [waitingCountdown, setWaitingCountdown] = useState(30);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  const [hasOtherParticipant, setHasOtherParticipant] = useState(false);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  const clearWaitingTimeout = useCallback(() => {
    if (waitingTimeoutRef.current) {
      clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
  }, []);

  const attachDailyListeners = useCallback((daily: DailyCall) => {
    if (globalListenersAttached) return;
    globalListenersAttached = true;
    console.log('[CallOverlay] Attaching Daily event listeners');

    daily.on('joining-meeting', () => {
      console.log('[CallOverlay] 📞 joining-meeting event');
    });

    daily.on('joined-meeting', () => {
      console.log('[CallOverlay] ✅ joined-meeting event');
      clearJoinTimeout();
      setIsJoining(false);
      setIsInWaitingRoom(true);
      
      // Enable media after joining
      try {
        if (dailyRef.current) {
          dailyRef.current.setLocalAudio(true);
          if (stateRef.current.call?.callType === 'video') {
            dailyRef.current.setLocalVideo(true);
          }
        }
        console.log('[CallOverlay] Media enabled');
      } catch (err) {
        console.error('[CallOverlay] Failed to enable media:', err);
      }

      // Check current participants
      const participants = daily.participants();
      const otherCount = Object.keys(participants).filter(k => k !== 'local').length;
      console.log('[CallOverlay] Other participants:', otherCount);
      
      if (otherCount > 0) {
        setHasOtherParticipant(true);
        callSounds.stopAll();
        callSounds.connect();
        setPhase('connected');
        setIsInWaitingRoom(false);
      }
    });

    daily.on('participant-joined', (event: any) => {
      console.log('[CallOverlay] 👤 participant-joined:', event?.participant?.user_id);
      setHasOtherParticipant(true);
      clearWaitingTimeout();
      callSounds.stopAll();
      callSounds.connect();
      setPhase('connected');
      setIsInWaitingRoom(false);
    });

    daily.on('participant-left', (event: any) => {
      console.log('[CallOverlay] 👤 participant-left:', event?.participant?.user_id);
      const participants = daily.participants();
      const otherCount = Object.keys(participants).filter(k => k !== 'local').length;
      if (otherCount === 0) {
        setHasOtherParticipant(false);
        toast.info('Other participant left');
      }
    });

    daily.on('left-meeting', () => {
      console.log('[CallOverlay] 👋 left-meeting event');
      clearJoinTimeout();
      clearWaitingTimeout();
      isLeavingRef.current = false;
    });

    daily.on('error', (event: any) => {
      console.error('[CallOverlay] ❌ error event:', event);
      clearJoinTimeout();
      clearWaitingTimeout();
      
      const msg = event?.errorMsg || event?.error?.msg || 'Call error';
      toast.error(msg);
      setError(msg);
      endCall();
    });
  }, [clearJoinTimeout, clearWaitingTimeout, setPhase, setError, endCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyDailyInstance();
    };
  }, []);

  // Reset state when phase changes
  useEffect(() => {
    if (state.phase === 'idle') {
      setIsJoining(false);
      setIsInWaitingRoom(false);
      setHasOtherParticipant(false);
      setWaitingCountdown(30);
      joinStartedRef.current = null;
      clearJoinTimeout();
      clearWaitingTimeout();
    } else if (state.phase === 'connected') {
      setIsJoining(false);
      setIsInWaitingRoom(false);
    }
  }, [state.phase, clearJoinTimeout, clearWaitingTimeout]);

  // Waiting room countdown
  useEffect(() => {
    if (!isInWaitingRoom) {
      setWaitingCountdown(30);
      return;
    }

    const interval = setInterval(() => {
      setWaitingCountdown(prev => {
        if (prev <= 1) {
          toast.info('No one joined - ending call');
          endCall();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isInWaitingRoom, endCall]);

  // Join call immediately when phase becomes 'joining'
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.roomUrl || !state.call?.roomName) return;
    if (!containerRef.current) return;
    if (isLeavingRef.current) return;

    const callId = state.call.id;
    if (joinStartedRef.current === callId) return;
    joinStartedRef.current = callId;

    let cancelled = false;
    setIsJoining(true);

    (async () => {
      try {
        // Request permissions
        await requestCallMediaPermissions(state.call!.callType);
        if (cancelled) return;

        // Get token
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('get-call-token', {
          body: {
            roomName: state.call!.roomName,
            callId,
          },
        });

        if (cancelled) return;

        if (tokenError || !tokenData?.token) {
          throw new Error(tokenError?.message || tokenData?.error || 'Failed to get meeting token');
        }

        // Android safety delay
        if (isAndroid()) {
          await nextAnimationFrame();
        }

        if (cancelled) return;

        // Create Daily instance
        const daily = createFreshDailyInstance(containerRef.current!, state.call!.roomUrl);
        if (!daily) {
          throw new Error('Failed to initialize call');
        }

        dailyRef.current = daily;
        attachDailyListeners(daily);

        // Set 25 second join timeout
        clearJoinTimeout();
        joinTimeoutRef.current = setTimeout(() => {
          console.error('[CallOverlay] Join timeout - no joined-meeting in 25s');
          toast.error('Call failed to connect');
          endCall();
        }, 25000);

        console.log('[CallOverlay] Calling daily.join()');
        await daily.join({ url: state.call!.roomUrl, token: tokenData.token });
        console.log('[CallOverlay] daily.join() returned');

      } catch (err: any) {
        console.error('[CallOverlay] Join failed:', err);
        clearJoinTimeout();
        toast.error(err.message || 'Failed to connect to call');
        setIsJoining(false);
        endCall();
      }
    })();

    return () => {
      cancelled = true;
      clearJoinTimeout();
    };
  }, [state.phase, state.call?.id, state.call?.roomUrl, state.call?.roomName, state.call?.callType, clearJoinTimeout, endCall, setError, attachDailyListeners]);

  // Call duration timer
  useEffect(() => {
    if (state.phase !== 'connected') {
      setCallDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase]);

  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    console.log('[CallOverlay] Hangup pressed');

    clearJoinTimeout();
    clearWaitingTimeout();
    isLeavingRef.current = true;

    const daily = dailyRef.current;
    if (daily) {
      try {
        const meetingState = daily.meetingState();
        if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
          console.log('[CallOverlay] Calling daily.leave()');
          await daily.leave();
        }
      } catch (err) {
        console.error('[CallOverlay] Error leaving:', err);
      }
    }

    await new Promise<void>(resolve => setTimeout(resolve, 500));
    
    await endCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, clearJoinTimeout, clearWaitingTimeout, endCall]);

  const handleToggleMute = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    const newMuted = !isMuted;
    daily.setLocalAudio(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  const handleToggleVideo = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily || state.call?.callType !== 'video') return;
    
    const newVideoOff = !isVideoOff;
    daily.setLocalVideo(!newVideoOff);
    setIsVideoOff(newVideoOff);
  }, [isVideoOff, state.call?.callType]);

  const handleAccept = useCallback(async () => {
    if (!state.call) return;
    
    try {
      await requestCallMediaPermissions(state.call.callType);
    } catch (err: any) {
      toast.error(err.message || 'Microphone permission required');
      return;
    }

    acceptCall(state.call);
  }, [state.call, acceptCall]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const otherUser = state.call?.isInitiator ? state.call.receiver : state.call?.caller;
  const isVisible = state.phase !== 'idle';
  const isVideoCall = state.call?.callType === 'video';
  const isRinging = state.phase === 'ringing';
  const isConnected = state.phase === 'connected';
  const isConnecting = state.phase === 'creating' || state.phase === 'joining';
  const showCallUI = isConnected || isInWaitingRoom;

  return (
    <>
      {/* Daily iframe container */}
      <div
        ref={containerRef}
        className={cn(
          'fixed inset-0 z-[9998] bg-black transition-opacity duration-200',
          (showCallUI || isConnecting) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        style={{ visibility: (showCallUI || isConnecting) ? 'visible' : 'hidden' }}
      />

      {/* Joining overlay */}
      <AnimatePresence>
        {isJoining && !isInWaitingRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/90 flex flex-col items-center justify-center gap-6"
          >
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="text-white text-lg">Joining call...</p>
            <Button variant="outline" onClick={handleHangup} disabled={isHangingUp}>
              Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting room overlay (on top of Daily iframe) */}
      <AnimatePresence>
        {isInWaitingRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] pointer-events-none"
          >
            {/* Waiting room header */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500/20 p-2 rounded-full">
                    <Users className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Waiting Room</p>
                    <p className="text-amber-400/80 text-sm">
                      Waiting for {otherUser?.display_name || otherUser?.username || 'them'} to join...
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-sm">Auto-end in</p>
                  <p className="text-white font-mono">{waitingCountdown}s</p>
                </div>
              </div>
            </div>

            {/* Controls at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-5 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full transition-colors",
                    isMuted ? "bg-white text-black" : "bg-white/15 text-white"
                  )}
                  onClick={handleToggleMute}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>

                {isVideoCall && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-14 w-14 rounded-full transition-colors",
                      isVideoOff ? "bg-white text-black" : "bg-white/15 text-white"
                    )}
                    onClick={handleToggleVideo}
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg"
                  onClick={handleHangup}
                  disabled={isHangingUp}
                >
                  {isHangingUp ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <PhoneOff className="h-7 w-7" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-call overlay (shown when connected) */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] pointer-events-none"
          >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-2 ring-white/20">
                  <AvatarImage src={otherUser?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/30">
                    {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium">
                    {otherUser?.display_name || otherUser?.username}
                  </p>
                  <p className="text-white/60 text-sm">
                    {formatDuration(callDuration)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 rounded-full"
                onClick={handleHangup}
                disabled={isHangingUp}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-5 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full transition-colors",
                    isMuted ? "bg-white text-black" : "bg-white/15 text-white"
                  )}
                  onClick={handleToggleMute}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>

                {isVideoCall && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-14 w-14 rounded-full transition-colors",
                      isVideoOff ? "bg-white text-black" : "bg-white/15 text-white"
                    )}
                    onClick={handleToggleVideo}
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg"
                  onClick={handleHangup}
                  disabled={isHangingUp}
                >
                  {isHangingUp ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <PhoneOff className="h-7 w-7" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming call dialog */}
      <AnimatePresence>
        {isRinging && state.call && (
          <IncomingCallDialog
            call={state.call}
            onAccept={handleAccept}
            onDecline={dismissIncoming}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// Inline incoming call dialog
function IncomingCallDialog({
  call,
  onAccept,
  onDecline,
}: {
  call: CallData;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onDecline]);

  const handleAccept = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    onAccept();
  };

  const handleDecline = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    callSounds.end();
    onDecline();
  };

  const isVideoCall = call.callType === 'video';
  const caller = call.caller;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-gradient-to-b from-black/90 via-black/95 to-black flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 backdrop-blur-xl" />
      
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="relative z-10 flex flex-col items-center max-w-sm w-full"
      >
        {/* Avatar */}
        <div className="relative mb-8">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <Avatar className="h-32 w-32 ring-4 ring-primary/30 shadow-2xl">
              <AvatarImage src={caller?.avatar_url || undefined} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-primary to-primary/50">
                {caller?.display_name?.charAt(0) || caller?.username?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full px-3 py-1 flex items-center gap-1 shadow-lg"
          >
            {isVideoCall ? <Video className="h-4 w-4 text-primary-foreground" /> : <Phone className="h-4 w-4 text-primary-foreground" />}
            <span className="text-xs font-medium text-primary-foreground">
              {isVideoCall ? 'Video' : 'Audio'}
            </span>
          </motion.div>
        </div>

        {/* Caller info */}
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-white mb-2">
            {caller?.display_name || caller?.username}
          </h2>
          <motion.p
            className="text-white/70 text-lg"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            Incoming {isVideoCall ? 'video' : 'audio'} call...
          </motion.p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-10 w-full">
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
              onClick={handleDecline}
              disabled={isProcessing}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
            <span className="text-white/60 text-sm">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Button
                size="icon"
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg"
                onClick={handleAccept}
                disabled={isProcessing}
              >
                {isVideoCall ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
              </Button>
            </motion.div>
            <span className="text-white/60 text-sm">Accept</span>
          </div>
        </div>

        <p className="mt-8 text-white/40 text-sm">
          Auto-declining in {timeLeft}s
        </p>
      </motion.div>
    </motion.div>
  );
}
