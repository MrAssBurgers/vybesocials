/**
 * Global Call Overlay
 * 
 * Uses Daily Prebuilt iframe for reliable WebRTC, with custom glassmorphic
 * UI overlaid on top for controls. Daily handles media; we handle UX.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions, isAndroid, nextAnimationFrame } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { supabase } from '@/integrations/supabase/client';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, setPhase, setError, dismissIncoming } = useCallStore();
  
  // Daily iframe container and instance
  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const listenersAttached = useRef(false);
  const isLeavingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCreatedRef = useRef(false);
  
  // Local UI state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isHangingUp, setIsHangingUp] = useState(false);

  // Track state for closures
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

  // Setup Daily event listeners
  const setupListeners = useCallback((daily: DailyCall) => {
    if (listenersAttached.current) return;
    listenersAttached.current = true;

    daily.on('joining-meeting', () => {
      console.log('[CallOverlay] 📞 joining-meeting');
    });

    daily.on('joined-meeting', () => {
      console.log('[CallOverlay] ✅ joined-meeting');
      clearJoinTimeout();
      
      if (stateRef.current.phase !== 'joining') {
        console.log('[CallOverlay] Ignoring joined (not in joining phase)');
        return;
      }

      try {
        daily.setLocalAudio(true);
        daily.setLocalVideo(stateRef.current.call?.callType === 'video');
      } catch (err) {
        console.error('[CallOverlay] Media enable error:', err);
      }

      callSounds.stopAll();
      callSounds.connect();
      setPhase('connected');
    });

    daily.on('left-meeting', () => {
      console.log('[CallOverlay] 👋 left-meeting');
      clearJoinTimeout();
      isLeavingRef.current = false;
    });

    daily.on('error', (event: any) => {
      console.error('[CallOverlay] ❌ error:', event);
      clearJoinTimeout();
      const msg = event?.errorMsg || event?.error?.msg || 'Call error';
      toast.error(msg);
      setError(msg);
      endCall();
    });
  }, [clearJoinTimeout, setPhase, setError, endCall]);

  // Create Daily iframe when container is available and we need to join
  const createDailyFrame = useCallback(() => {
    if (!containerRef.current || dailyRef.current || frameCreatedRef.current) {
      return dailyRef.current;
    }

    console.log('[CallOverlay] Creating Daily frame');
    frameCreatedRef.current = true;

    try {
      const daily = DailyIframe.createFrame(containerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '0',
        },
        showLeaveButton: false,
        showFullscreenButton: false,
        showLocalVideo: true,
        showParticipantsBar: false,
      });

      dailyRef.current = daily;
      setupListeners(daily);
      return daily;
    } catch (err) {
      console.error('[CallOverlay] Frame creation failed:', err);
      frameCreatedRef.current = false;
      return null;
    }
  }, [setupListeners]);

  // Join room when phase becomes 'joining'
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.roomUrl || !state.call?.roomName) return;
    if (isLeavingRef.current) return;

    let cancelled = false;

    const doJoin = async () => {
      // Request permissions first
      try {
        await requestCallMediaPermissions(state.call!.callType);
        console.log('[CallOverlay] Permissions granted');
      } catch (err: any) {
        console.error('[CallOverlay] Permission denied:', err);
        toast.error(err.message || 'Microphone permission required');
        endCall();
        return;
      }

      if (isAndroid()) {
        await nextAnimationFrame();
      }

      if (cancelled) return;

      // Fetch token
      let token: string | undefined;
      try {
        console.log('[CallOverlay] Fetching token...');
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('get-call-token', {
          body: {
            roomName: state.call!.roomName,
            callId: state.call!.id,
          },
        });

        if (tokenError) throw new Error(tokenError.message);
        if (!tokenData?.token) throw new Error(tokenData?.error || 'No token');

        token = tokenData.token;
        console.log('[CallOverlay] Token received');
      } catch (err: any) {
        console.error('[CallOverlay] Token error:', err);
        toast.error(err.message || 'Authentication failed');
        endCall();
        return;
      }

      if (cancelled) return;

      // Create frame if needed
      let daily = dailyRef.current;
      if (!daily) {
        // Wait for container to be available
        await new Promise(resolve => setTimeout(resolve, 100));
        daily = createDailyFrame();
      }

      if (!daily) {
        console.error('[CallOverlay] No Daily instance');
        toast.error('Call system not ready');
        endCall();
        return;
      }

      // Leave any previous meeting
      try {
        const meetingState = daily.meetingState();
        if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
          await daily.leave();
        }
      } catch {
        // ignore
      }

      if (cancelled) return;

      // Set timeout
      clearJoinTimeout();
      joinTimeoutRef.current = setTimeout(() => {
        console.error('[CallOverlay] Join timeout');
        toast.error('Call failed to connect');
        endCall();
      }, 15000);

      // Join
      try {
        console.log('[CallOverlay] Joining room');
        await daily.join({ url: state.call!.roomUrl, token });
        console.log('[CallOverlay] Join completed');
      } catch (err: any) {
        console.error('[CallOverlay] Join failed:', err);
        clearJoinTimeout();
        toast.error('Failed to connect');
        endCall();
      }
    };

    doJoin();

    return () => {
      cancelled = true;
      clearJoinTimeout();
    };
  }, [state.phase, state.call?.roomUrl, state.call?.roomName, state.call?.id, state.call?.callType, clearJoinTimeout, endCall, createDailyFrame]);

  // Force leave if state resets
  useEffect(() => {
    if (state.phase !== 'idle') return;
    const daily = dailyRef.current;
    if (!daily) return;

    try {
      const meetingState = daily.meetingState();
      if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
        console.log('[CallOverlay] Forcing leave');
        clearJoinTimeout();
        daily.leave();
      }
    } catch {
      // ignore
    }
  }, [state.phase, clearJoinTimeout]);

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

  // Hangup
  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    console.log('[CallOverlay] Hangup');

    clearJoinTimeout();
    isLeavingRef.current = true;

    const daily = dailyRef.current;
    if (daily) {
      try {
        const meetingState = daily.meetingState();
        if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
          await daily.leave();
        }
      } catch (err) {
        console.error('[CallOverlay] Leave error:', err);
      }
    }

    await new Promise<void>(resolve => setTimeout(resolve, 300));
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

  const otherUser = state.call?.isInitiator ? state.call.receiver : state.call?.caller;
  const isVisible = state.phase !== 'idle';
  const isVideoCall = state.call?.callType === 'video';
  const isRinging = state.phase === 'ringing';
  const isConnected = state.phase === 'connected';
  const isConnecting = state.phase === 'creating' || state.phase === 'joining';

  return (
    <>
      {/* Main Call UI */}
      <AnimatePresence>
        {isVisible && !isRinging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9998]"
            style={{
              background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(240 10% 8%) 50%, hsl(280 20% 8%) 100%)'
            }}
          >
            {/* Daily iframe container - shows the actual video */}
            <div
              ref={containerRef}
              className="absolute inset-0"
              style={{ zIndex: 1 }}
            />

            {/* Custom glassmorphic overlay UI */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
              {/* Header */}
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="absolute top-0 left-0 right-0 pointer-events-auto"
              >
                <div className="mx-4 mt-4 p-4 rounded-2xl backdrop-blur-xl bg-black/40 border border-white/10 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar className="h-12 w-12 ring-2 ring-white/20 shadow-lg">
                          <AvatarImage src={otherUser?.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">
                            {otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {isConnected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black/50"
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-lg">
                          {otherUser?.display_name || otherUser?.username}
                        </p>
                        <div className="flex items-center gap-2">
                          {isConnecting && (
                            <motion.div 
                              className="flex items-center gap-2 text-white/60"
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="text-sm">Connecting...</span>
                            </motion.div>
                          )}
                          {isConnected && (
                            <div className="flex items-center gap-2">
                              <span className="flex h-2 w-2 rounded-full bg-green-500" />
                              <span className="text-white/70 text-sm font-mono">
                                {formatDuration(callDuration)}
                              </span>
                            </div>
                          )}
                          {state.phase === 'error' && (
                            <span className="text-red-400 text-sm">{state.error}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
                      {isVideoCall ? (
                        <Video className="h-4 w-4 text-white/70" />
                      ) : (
                        <Phone className="h-4 w-4 text-white/70" />
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Control Bar */}
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 25 }}
                className="absolute bottom-0 left-0 right-0 pb-10 pointer-events-auto"
              >
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl bg-black/40 border border-white/10 shadow-2xl">
                    {/* Mute Button */}
                    <button
                      onClick={handleToggleMute}
                      disabled={!isConnected}
                      className={cn(
                        "h-14 w-14 rounded-xl flex items-center justify-center transition-all",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isMuted 
                          ? "bg-white text-black" 
                          : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </button>

                    {/* Video Toggle */}
                    {isVideoCall && (
                      <button
                        onClick={handleToggleVideo}
                        disabled={!isConnected}
                        className={cn(
                          "h-14 w-14 rounded-xl flex items-center justify-center transition-all",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          isVideoOff 
                            ? "bg-white text-black" 
                            : "bg-white/10 text-white hover:bg-white/20"
                        )}
                      >
                        {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                      </button>
                    )}

                    <div className="w-px h-10 bg-white/20 mx-1" />

                    {/* End Call */}
                    <button
                      onClick={handleHangup}
                      disabled={isHangingUp}
                      className={cn(
                        "h-14 px-6 rounded-xl flex items-center justify-center gap-2 transition-all",
                        "bg-gradient-to-r from-red-500 to-red-600 text-white",
                        "hover:from-red-600 hover:to-red-700",
                        "disabled:opacity-70"
                      )}
                    >
                      {isHangingUp ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <PhoneOff className="h-5 w-5" />
                          <span className="font-medium">End</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incoming call dialog */}
      <AnimatePresence>
        {isRinging && state.call && (
          <motion.div
            key={`incoming-${state.call.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            style={{
              background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(280 20% 8%) 50%, hsl(240 10% 6%) 100%)',
            }}
          >
            <IncomingCallDialog
              call={state.call}
              onAccept={handleAccept}
              onDecline={dismissIncoming}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Incoming call dialog
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
  const processingRef = useRef(false);

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

  const handleAccept = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    onAccept();
  };

  const handleDecline = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    callSounds.end();
    onDecline();
  };

  const isVideoCall = call.callType === 'video';
  const caller = call.caller;

  return (
    <>
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }}
        />
      </div>

      <div className="absolute inset-0 backdrop-blur-3xl" />

      <motion.div
        initial={{ scale: 0.8, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative z-10 flex flex-col items-center max-w-sm w-full"
      >
        {/* Avatar */}
        <div className="relative mb-8">
          <motion.div
            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-primary/50"
            style={{ width: 144, height: 144, margin: '-8px' }}
          />
          <motion.div
            animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
            transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-accent/40"
            style={{ width: 144, height: 144, margin: '-8px' }}
          />
          
          <motion.div
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            <Avatar className="h-32 w-32 ring-4 ring-white/10 shadow-2xl">
              <AvatarImage src={caller?.avatar_url || undefined} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                {caller?.display_name?.charAt(0) || caller?.username?.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2"
          >
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-accent flex items-center gap-1.5 shadow-lg">
              {isVideoCall ? <Video className="h-4 w-4 text-white" /> : <Phone className="h-4 w-4 text-white" />}
              <span className="text-xs font-semibold text-white">
                {isVideoCall ? 'Video Call' : 'Audio Call'}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Caller info */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">
            {caller?.display_name || caller?.username}
          </h2>
          <motion.p
            className="text-white/60 text-lg"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            is calling you...
          </motion.p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-8 w-full mb-8">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleDecline}
              disabled={isProcessing}
              className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg flex items-center justify-center hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-white/50 text-sm font-medium">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleAccept}
              disabled={isProcessing}
              className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg flex items-center justify-center hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90 animate-pulse"
            >
              {isVideoCall ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </button>
            <span className="text-white/50 text-sm font-medium">Accept</span>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          <span>Auto-declining in {timeLeft}s</span>
        </div>
      </motion.div>
    </>
  );
}
