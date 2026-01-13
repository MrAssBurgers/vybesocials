/**
 * Global Call Overlay
 * 
 * Mounted ONCE at app root. Contains:
 * - Single Daily Prebuilt iframe (never duplicated)
 * - Incoming call dialog
 * - In-call UI with hangup
 * 
 * State is driven by Daily events, not local assumptions.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions, isAndroid, nextAnimationFrame } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';

// DOM check to prevent duplicate iframes
function hasExistingDailyIframe(): boolean {
  if (typeof document === 'undefined') return false;
  const existing = document.querySelector('iframe[allow*="camera"]');
  return !!existing;
}

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, setPhase, setError, dismissIncoming } = useCallStore();
  
  // Refs for persistent iframe
  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const listenersAttached = useRef(false);
  const isLeavingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Local UI state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isHangingUp, setIsHangingUp] = useState(false);

  // Track call data for stale closure prevention
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clear join timeout helper
  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  // Create Daily iframe ONCE on mount
  useEffect(() => {
    if (!containerRef.current) return;
    if (dailyRef.current) return;
    if (hasExistingDailyIframe()) {
      console.warn('[CallOverlay] Existing Daily iframe detected, skipping creation');
      return;
    }

    console.log('[CallOverlay] Creating permanent Daily iframe');
    
    const daily = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
      },
      showLeaveButton: false,
      showFullscreenButton: true,
    });

    dailyRef.current = daily;

    // Attach event listeners ONCE
    if (!listenersAttached.current) {
      listenersAttached.current = true;

      daily.on('joining-meeting', () => {
        console.log('[CallOverlay] 📞 joining-meeting event');
      });

      daily.on('joined-meeting', () => {
        console.log('[CallOverlay] ✅ joined-meeting event');
        clearJoinTimeout();
        
        if (stateRef.current.phase !== 'joining') {
          console.log('[CallOverlay] Ignoring joined-meeting (not in joining phase)');
          return;
        }

        // CRITICAL: Enable media after joining
        try {
          daily.setLocalAudio(true);
          if (stateRef.current.call?.callType === 'video') {
            daily.setLocalVideo(true);
          } else {
            daily.setLocalVideo(false);
          }
          console.log('[CallOverlay] Media enabled');
        } catch (err) {
          console.error('[CallOverlay] Failed to enable media:', err);
        }

        callSounds.stopAll();
        callSounds.connect();
        setPhase('connected');
      });

      daily.on('left-meeting', () => {
        console.log('[CallOverlay] 👋 left-meeting event');
        clearJoinTimeout();
        isLeavingRef.current = false;
        
        // Don't reset state here - let endCall handle it
      });

      daily.on('error', (event: any) => {
        console.error('[CallOverlay] ❌ error event:', event);
        clearJoinTimeout();
        
        const msg = event?.errorMsg || event?.error?.msg || 'Call error';
        toast.error(msg);
        setError(msg);
        endCall();
      });
    }

    return () => {
      // Don't destroy on unmount - keep iframe permanent
    };
  }, [clearJoinTimeout, setPhase, setError, endCall]);

  // Join room when phase becomes 'joining'
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.roomUrl) return;
    if (!dailyRef.current) {
      console.error('[CallOverlay] No Daily instance for join');
      setError('Call system not ready');
      return;
    }
    if (isLeavingRef.current) return;

    const daily = dailyRef.current;
    let cancelled = false;

    const doJoin = async () => {
      console.log('[CallOverlay] Starting join flow for:', state.call?.roomUrl);

      // Request media permissions (required before join)
      try {
        await requestCallMediaPermissions(state.call!.callType);
        console.log('[CallOverlay] Permissions granted');
      } catch (err: any) {
        console.error('[CallOverlay] Permission denied:', err);
        toast.error(err.message || 'Microphone permission required');
        endCall();
        return;
      }

      // Android safety delay
      if (isAndroid()) {
        await nextAnimationFrame();
      }

      if (cancelled) return;

      // Leave any previous room first
      try {
        const meetingState = daily.meetingState();
        if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
          console.log('[CallOverlay] Leaving previous room');
          await daily.leave();
        }
      } catch {
        // ignore
      }

      if (cancelled) return;

      // Set 15 second timeout for join
      clearJoinTimeout();
      joinTimeoutRef.current = setTimeout(() => {
        console.error('[CallOverlay] Join timeout - no joined-meeting in 15s');
        toast.error('Call failed to connect');
        endCall();
      }, 15000);

      // Join the room
      try {
        console.log('[CallOverlay] Calling daily.join()');
        await daily.join({ url: state.call!.roomUrl });
        console.log('[CallOverlay] daily.join() returned');
      } catch (err: any) {
        console.error('[CallOverlay] Join failed:', err);
        clearJoinTimeout();
        toast.error('Failed to connect to call');
        endCall();
      }
    };

    doJoin();

    return () => {
      cancelled = true;
      clearJoinTimeout();
    };
  }, [state.phase, state.call?.roomUrl, state.call?.callType, clearJoinTimeout, endCall, setError]);

  // Call duration timer
  useEffect(() => {
    if (state.phase !== 'connected') {
      setCallDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase]);

  // HANGUP - must always work
  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    console.log('[CallOverlay] Hangup pressed');

    clearJoinTimeout();
    isLeavingRef.current = true;

    // Call daily.leave()
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

    // Force cleanup after 2s max wait
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    
    await endCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, clearJoinTimeout, endCall]);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily || state.phase !== 'connected') return;
    
    const newMuted = !isMuted;
    daily.setLocalAudio(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted, state.phase]);

  // Toggle video
  const handleToggleVideo = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily || state.phase !== 'connected' || state.call?.callType !== 'video') return;
    
    const newVideoOff = !isVideoOff;
    daily.setLocalVideo(!newVideoOff);
    setIsVideoOff(newVideoOff);
  }, [isVideoOff, state.phase, state.call?.callType]);

  // Accept incoming call
  const handleAccept = useCallback(async () => {
    if (!state.call) return;
    
    // Request permissions first
    try {
      await requestCallMediaPermissions(state.call.callType);
    } catch (err: any) {
      toast.error(err.message || 'Microphone permission required');
      return;
    }

    acceptCall(state.call);
  }, [state.call, acceptCall]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get other user
  const otherUser = state.call?.isInitiator ? state.call.receiver : state.call?.caller;
  const isVisible = state.phase !== 'idle';
  const isVideoCall = state.call?.callType === 'video';
  const isRinging = state.phase === 'ringing';
  const isConnected = state.phase === 'connected';
  const isConnecting = state.phase === 'creating' || state.phase === 'joining';

  return (
    <>
      {/* Permanent Daily iframe container - always in DOM */}
      <div
        ref={containerRef}
        className={cn(
          'fixed inset-0 z-[9998] bg-black transition-opacity duration-200',
          isVisible && !isRinging ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        style={{ visibility: isVisible && !isRinging ? 'visible' : 'hidden' }}
      />

      {/* In-call overlay UI */}
      <AnimatePresence>
        {isVisible && !isRinging && (
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
                    {isConnecting && (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Connecting...
                      </span>
                    )}
                    {isConnected && formatDuration(callDuration)}
                    {state.phase === 'error' && (
                      <span className="text-red-400">{state.error}</span>
                    )}
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

            {/* Connecting overlay */}
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                <div className="text-center">
                  <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-white/10">
                    <AvatarImage src={otherUser?.avatar_url || undefined} />
                    <AvatarFallback className="text-3xl bg-primary/30">
                      {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-white/70"
                  >
                    Connecting...
                  </motion.div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-5 pb-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto">
              <div className="flex items-center justify-center gap-4">
                {/* Mute */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full transition-colors",
                    isMuted ? "bg-white text-black" : "bg-white/15 text-white"
                  )}
                  onClick={handleToggleMute}
                  disabled={!isConnected}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>

                {/* Video toggle */}
                {isVideoCall && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-14 w-14 rounded-full transition-colors",
                      isVideoOff ? "bg-white text-black" : "bg-white/15 text-white"
                    )}
                    onClick={handleToggleVideo}
                    disabled={!isConnected}
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </Button>
                )}

                {/* Hangup */}
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
