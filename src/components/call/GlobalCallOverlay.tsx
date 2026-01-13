/**
 * Global Call Overlay
 * 
 * Mounted ONCE at app root. Contains:
 * - Single Daily Prebuilt iframe (never duplicated)
 * - Incoming call dialog
 * - In-call UI with hangup
 * 
 * State is driven by Daily events, not local assumptions.
 * UI is a polished glass pop-up overlay.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions, isAndroid, nextAnimationFrame } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { supabase } from '@/integrations/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';

// Module-level singleton to prevent duplicate Daily instances
let globalDailyInstance: DailyCall | null = null;
let globalDailyContainer: HTMLDivElement | null = null;

function getOrCreateDailyInstance(container: HTMLDivElement): DailyCall {
  // If we already have an instance, return it
  if (globalDailyInstance) {
    // Re-attach to new container if needed
    if (globalDailyContainer !== container && container) {
      globalDailyContainer = container;
    }
    return globalDailyInstance;
  }

  console.log('[CallOverlay] Creating singleton Daily instance');
  
  globalDailyContainer = container;
  globalDailyInstance = DailyIframe.createFrame(container, {
    iframeStyle: {
      width: '100%',
      height: '100%',
      border: 'none',
      borderRadius: '1rem',
    },
    showLeaveButton: false,
    showFullscreenButton: false,
  });

  return globalDailyInstance;
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
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track call data for stale closure prevention
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Reset UI state when call ends
  useEffect(() => {
    if (state.phase === 'idle') {
      setIsMuted(false);
      setIsVideoOff(false);
      setCallDuration(0);
      setIsHangingUp(false);
      setShowControls(true);
    }
  }, [state.phase]);

  // Clear join timeout helper
  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  // Auto-hide controls for video calls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (state.call?.callType === 'video' && state.phase === 'connected') {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }
  }, [state.call?.callType, state.phase]);

  // Create Daily iframe ONCE using singleton pattern
  useEffect(() => {
    if (!containerRef.current) return;
    if (dailyRef.current) return;

    console.log('[CallOverlay] Initializing Daily instance');
    
    const daily = getOrCreateDailyInstance(containerRef.current);
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
    if (state.phase !== 'joining' || !state.call?.roomUrl || !state.call?.roomName) return;
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

      // Fetch meeting token for private room
      let token: string | undefined;
      try {
        console.log('[CallOverlay] Fetching meeting token...');
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('get-call-token', {
          body: {
            roomName: state.call!.roomName,
            callId: state.call!.id,
          },
        });

        if (tokenError) {
          throw new Error(tokenError.message || 'Failed to get meeting token');
        }

        if (!tokenData?.token) {
          throw new Error(tokenData?.error || 'No token returned from server');
        }

        token = tokenData.token;
        console.log('[CallOverlay] Token received');
      } catch (err: any) {
        console.error('[CallOverlay] Token fetch failed:', err);
        toast.error(err.message || 'Failed to authenticate with call server');
        endCall();
        return;
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

      // Join the room WITH token
      try {
        console.log('[CallOverlay] Calling daily.join() with token');
        await daily.join({ url: state.call!.roomUrl, token });
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
  }, [state.phase, state.call?.roomUrl, state.call?.roomName, state.call?.id, state.call?.callType, clearJoinTimeout, endCall, setError]);

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

    // Force cleanup after short wait
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    
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
    resetControlsTimeout();
  }, [isMuted, state.phase, resetControlsTimeout]);

  // Toggle video
  const handleToggleVideo = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily || state.phase !== 'connected' || state.call?.callType !== 'video') return;
    
    const newVideoOff = !isVideoOff;
    daily.setLocalVideo(!newVideoOff);
    setIsVideoOff(newVideoOff);
    resetControlsTimeout();
  }, [isVideoOff, state.phase, state.call?.callType, resetControlsTimeout]);

  // Accept incoming call
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
      {/* Backdrop - locks background interaction when call is active */}
      <AnimatePresence>
        {isVisible && !isRinging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9997] bg-black/60 backdrop-blur-md"
            onClick={resetControlsTimeout}
          />
        )}
      </AnimatePresence>

      {/* Call Overlay Card */}
      <AnimatePresence>
        {isVisible && !isRinging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 z-[9998] flex items-center justify-center pointer-events-none"
            onClick={resetControlsTimeout}
          >
            <div 
              className={cn(
                "relative w-full pointer-events-auto overflow-hidden",
                "bg-gradient-to-b from-card/95 to-card/90 backdrop-blur-xl",
                "border border-border/50 shadow-2xl",
                "rounded-2xl md:rounded-3xl",
                // Responsive sizing
                isVideoCall 
                  ? "max-w-4xl h-[85vh] max-h-[700px]" 
                  : "max-w-md h-auto"
              )}
              style={{ 
                paddingBottom: 'env(safe-area-inset-bottom)',
                marginTop: 'env(safe-area-inset-top)',
              }}
            >
              {/* Video container - only for video calls */}
              {isVideoCall && (
                <div
                  ref={containerRef}
                  className="absolute inset-0 rounded-2xl md:rounded-3xl overflow-hidden"
                />
              )}

              {/* Audio call content */}
              {!isVideoCall && (
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  {/* Avatar with pulse animation when connecting */}
                  <div className="relative mb-6">
                    <motion.div
                      animate={isConnecting ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Avatar className="h-28 w-28 ring-4 ring-primary/20 shadow-xl">
                        <AvatarImage src={otherUser?.avatar_url || undefined} />
                        <AvatarFallback className="text-4xl bg-gradient-to-br from-primary/80 to-primary/40">
                          {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                    
                    {/* Status indicator */}
                    {isConnected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-green-500 rounded-full px-3 py-1 flex items-center gap-1 shadow-lg"
                      >
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-xs font-medium text-white">Connected</span>
                      </motion.div>
                    )}
                  </div>

                  {/* User info */}
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    {otherUser?.display_name || otherUser?.username}
                  </h2>
                  
                  {/* Status text */}
                  <div className="text-muted-foreground text-sm mb-8">
                    {isConnecting && (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Connecting...
                      </span>
                    )}
                    {isConnected && (
                      <span className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {formatDuration(callDuration)}
                      </span>
                    )}
                    {state.phase === 'error' && (
                      <span className="text-destructive">{state.error}</span>
                    )}
                  </div>

                  {/* Hidden container for Daily iframe (audio only) */}
                  <div ref={containerRef} className="hidden" />
                </div>
              )}

              {/* Video call connecting overlay */}
              {isVideoCall && isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl md:rounded-3xl">
                  <div className="text-center">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-white/20 shadow-xl">
                        <AvatarImage src={otherUser?.avatar_url || undefined} />
                        <AvatarFallback className="text-3xl bg-gradient-to-br from-primary/80 to-primary/40">
                          {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                    <p className="text-white font-medium mb-2">
                      {otherUser?.display_name || otherUser?.username}
                    </p>
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-white/70 flex items-center justify-center gap-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </motion.p>
                  </div>
                </div>
              )}

              {/* Controls overlay */}
              <motion.div
                initial={false}
                animate={{ opacity: showControls || !isVideoCall ? 1 : 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "absolute bottom-0 left-0 right-0 p-4 md:p-6",
                  isVideoCall && "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                  !isVideoCall && "relative"
                )}
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
              >
                {/* Video call header info */}
                {isVideoCall && isConnected && showControls && (
                  <div className="absolute top-0 left-0 right-0 p-4 flex items-center gap-3 -translate-y-full">
                    <Avatar className="h-10 w-10 ring-2 ring-white/20">
                      <AvatarImage src={otherUser?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/30 text-white text-sm">
                        {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white font-medium text-sm">
                        {otherUser?.display_name || otherUser?.username}
                      </p>
                      <p className="text-white/60 text-xs">{formatDuration(callDuration)}</p>
                    </div>
                  </div>
                )}

                {/* Control buttons */}
                <div className="flex items-center justify-center gap-4">
                  {/* Mute */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-14 w-14 rounded-full transition-all duration-200",
                      isMuted 
                        ? "bg-white text-black hover:bg-white/90" 
                        : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm",
                      !isConnected && "opacity-50"
                    )}
                    onClick={handleToggleMute}
                    disabled={!isConnected}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </Button>

                  {/* Speaker (audio calls only) */}
                  {!isVideoCall && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-14 w-14 rounded-full transition-all duration-200",
                        "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm",
                        !isConnected && "opacity-50"
                      )}
                      disabled={!isConnected}
                      aria-label="Speaker"
                    >
                      <Volume2 className="h-6 w-6" />
                    </Button>
                  )}

                  {/* Video toggle */}
                  {isVideoCall && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-14 w-14 rounded-full transition-all duration-200",
                        isVideoOff 
                          ? "bg-white text-black hover:bg-white/90" 
                          : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm",
                        !isConnected && "opacity-50"
                      )}
                      onClick={handleToggleVideo}
                      disabled={!isConnected}
                      aria-label={isVideoOff ? "Turn on camera" : "Turn off camera"}
                    >
                      {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                    </Button>
                  )}

                  {/* End Call - CRITICAL: Always visible and functional */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className={cn(
                      "h-16 w-16 rounded-full shadow-lg transition-all duration-200",
                      "bg-red-500 hover:bg-red-600 active:scale-95",
                      isHangingUp && "opacity-80"
                    )}
                    onClick={handleHangup}
                    disabled={isHangingUp}
                    aria-label="End call"
                  >
                    {isHangingUp ? (
                      <Loader2 className="h-7 w-7 animate-spin text-white" />
                    ) : (
                      <PhoneOff className="h-7 w-7 text-white" />
                    )}
                  </Button>
                </div>

                {/* Ending call indicator */}
                {isHangingUp && (
                  <p className="text-center text-white/60 text-sm mt-3">
                    Ending call...
                  </p>
                )}
              </motion.div>
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

// Incoming call dialog component
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
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xl"
      />
      
      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      >
        <div 
          className="relative w-full max-w-sm bg-gradient-to-b from-card/95 to-card/90 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl p-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
        >
          {/* Avatar */}
          <div className="relative mx-auto mb-6 w-fit">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Avatar className="h-28 w-28 ring-4 ring-primary/30 shadow-xl">
                <AvatarImage src={caller?.avatar_url || undefined} />
                <AvatarFallback className="text-4xl bg-gradient-to-br from-primary to-primary/50">
                  {caller?.display_name?.charAt(0) || caller?.username?.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            
            {/* Call type badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg"
            >
              {isVideoCall ? (
                <Video className="h-4 w-4 text-primary-foreground" />
              ) : (
                <Phone className="h-4 w-4 text-primary-foreground" />
              )}
              <span className="text-xs font-medium text-primary-foreground">
                {isVideoCall ? 'Video' : 'Audio'}
              </span>
            </motion.div>
          </div>

          {/* Caller info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              {caller?.display_name || caller?.username}
            </h2>
            <motion.p
              className="text-muted-foreground"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              Incoming {isVideoCall ? 'video' : 'audio'} call...
            </motion.p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg active:scale-95 transition-transform"
                onClick={handleDecline}
                disabled={isProcessing}
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
              <span className="text-muted-foreground text-sm">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <Button
                  size="icon"
                  className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg active:scale-95 transition-transform"
                  onClick={handleAccept}
                  disabled={isProcessing}
                >
                  {isVideoCall ? (
                    <Video className="h-7 w-7" />
                  ) : (
                    <Phone className="h-7 w-7" />
                  )}
                </Button>
              </motion.div>
              <span className="text-muted-foreground text-sm">Accept</span>
            </div>
          </div>

          {/* Auto-decline timer */}
          <p className="mt-6 text-center text-muted-foreground/60 text-sm">
            Auto-declining in {timeLeft}s
          </p>
        </div>
      </motion.div>
    </>
  );
}
