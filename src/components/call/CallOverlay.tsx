import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallOverlay } from '@/components/call/CallOverlayContext';
import { X, Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ensureDailyFrame, joinRoom, leaveRoom } from '@/lib/dailySingleton';
import type { DailyCall } from '@daily-co/daily-js';

export function CallOverlay() {
  const { state, closeCall } = useCallOverlay();

  // Permanent iframe host (always mounted)
  const hostElRef = useRef<HTMLDivElement | null>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const listenersAttachedRef = useRef(false);

  // Call states driven ONLY by Daily events
  const [callState, setCallState] = useState<'idle' | 'joining' | 'connected' | 'ended'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use browser-safe timer typing
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Avoid stale closures in permanent Daily event listeners
  const callTypeRef = useRef<typeof state.callType>(state.callType);
  const callStateRef = useRef(callState);
  const joinAttemptIdRef = useRef(0);
  const shouldCloseOnLeftMeetingRef = useRef(false);
  const waitForLeftMeetingResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    callTypeRef.current = state.callType;
  }, [state.callType]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    // Reset per-overlay session flags
    if (!state.isOpen) {
      shouldCloseOnLeftMeetingRef.current = false;
      waitForLeftMeetingResolveRef.current = null;
    }
  }, [state.isOpen]);

  // 1) CREATE DAILY IFRAME ONCE (on app load / first mount of host element)
  //    - never create inside openCall or state-driven effects
  // 2) NEVER CONDITIONALLY MOUNT THE IFRAME (host div always rendered)
  const setHostEl = useCallback((el: HTMLDivElement | null) => {
    hostElRef.current = el;

    if (!el) return;
    if (dailyRef.current) return;

    console.log('[CALL DEBUG] Mounting permanent Daily iframe (one-time)');

    const daily = ensureDailyFrame(el, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '0',
      },
      showLeaveButton: false,
      showFullscreenButton: true,
    });

    dailyRef.current = daily;

    if (!listenersAttachedRef.current) {
      listenersAttachedRef.current = true;

      // MANDATORY EVENT-DRIVEN FLOW: State changes ONLY from Daily events
      daily.on('joined-meeting', async () => {
        console.log('[CALL DEBUG] ✅ joined-meeting event fired');

        // Ignore late events if we are no longer trying to join
        if (callStateRef.current !== 'joining') {
          console.log('[CALL DEBUG] joined-meeting ignored (not in joining state)');
          return;
        }

        // Clear join timeout (success)
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }

        // Mark call as connected ONLY when joined-meeting fires
        setCallState('connected');
        setErrorMessage(null);

        // AUDIO / VIDEO ENABLE: Ensure media is live after join
        try {
          console.log('[CALL DEBUG] Enabling local audio/video');

          // Enable audio for all calls
          daily.setLocalAudio(true);

          // Enable video for video calls
          if (callTypeRef.current === 'video') {
            daily.setLocalVideo(true);
          } else {
            daily.setLocalVideo(false);
          }

          console.log('[CALL DEBUG] Media enabled successfully');
        } catch (mediaError) {
          console.error('[CALL DEBUG] Failed to enable media:', mediaError);
          toast.error('Failed to enable media');
        }
      });

      daily.on('left-meeting', () => {
        console.log('[CALL DEBUG] ✅ left-meeting event fired');

        // Clear any pending timeout
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }

        // Resolve any waiter (hangup flow)
        if (waitForLeftMeetingResolveRef.current) {
          waitForLeftMeetingResolveRef.current();
          waitForLeftMeetingResolveRef.current = null;
        }

        // Reset call state
        setCallState('ended');
        setErrorMessage(null);

        // CLEANUP GUARANTEE: Hide overlay and allow future calls immediately
        closeCall();
        shouldCloseOnLeftMeetingRef.current = false;
      });

      daily.on('error', (event: any) => {
        const reason = event?.errorMsg || event?.error?.msg || 'Unknown Daily error';
        console.error('[CALL DEBUG] ❌ daily error event:', event);
        
        setErrorMessage(String(reason));
        toast.error(`Call error: ${String(reason)}`);
        
        // FAILURE RECOVERY: leave + reset state + hide overlay
        void (async () => {
          await leaveRoom();
          setCallState('ended');
          closeCall();
        })();
      });
    }
  }, [closeCall]);

  // JOIN FIX: Proper flow with timeout failsafe
  useEffect(() => {
    if (!state.isOpen) return;
    if (!state.roomUrl) {
      setErrorMessage('Missing roomUrl');
      toast.error('Call failed: missing roomUrl');
      closeCall();
      return;
    }

    let cancelled = false;

    const run = async () => {
      console.log('[CALL DEBUG] 🚀 Starting call join flow', { roomUrl: state.roomUrl });

      // Set state to joining (show "Connecting...")
      setCallState('joining');
      setErrorMessage(null);

      try {
        // Always leave any previous room first (same iframe)
        await leaveRoom();

        // Request media permissions once per call attempt (still required by browser)
        try {
          await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: state.callType === 'video',
          });
          console.log('[CALL DEBUG] ✅ Media permissions granted');
        } catch (permError: any) {
          const msg = state.callType === 'video'
            ? 'Microphone and camera permission required'
            : 'Microphone permission required';
          console.error('[CALL DEBUG] ❌ Media permission denied:', permError);
          setErrorMessage(permError?.message ? `${msg}: ${permError.message}` : msg);
          toast.error(msg);
          setCallState('ended');
          await leaveRoom();
          closeCall();
          return;
        }

        // FAILSAFE: If "joined-meeting" does not fire within 15 seconds
        joinTimeoutRef.current = setTimeout(() => {
          console.error('[CALL DEBUG] ⏱️ Join timeout - no joined-meeting event within 15s');
          toast.error('Call failed to connect');
          setErrorMessage('Call failed to connect');
          setCallState('ended');
          void (async () => {
            await leaveRoom();
            closeCall();
          })();
        }, 15000);

        // Join on the existing iframe (state changes to 'connected' via 'joined-meeting' event)
        console.log('[CALL DEBUG] 📞 Calling joinRoom()...');
        await joinRoom(state.roomUrl);
        console.log('[CALL DEBUG] ✅ joinRoom() completed (waiting for joined-meeting event)');

        if (cancelled) return;
      } catch (e: any) {
        const reason = e?.message || String(e);
        console.error('[CALL DEBUG] ❌ join failed:', e);
        setErrorMessage(reason);
        toast.error(`Failed to start call: ${reason}`);

        // Clear timeout
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }

        // FAILURE RECOVERY: leave + reset state + hide overlay
        setCallState('ended');
        await leaveRoom();
        closeCall();
      }
    };

    run();

    return () => {
      cancelled = true;
      // Clear timeout on unmount
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
    };
  }, [state.isOpen, state.roomUrl, state.callType, closeCall]);

  // HANGUP BUTTON (CRITICAL)
  // 1) Call daily.leave()
  // 2) Wait for "left-meeting"
  // 3) THEN hide overlay (left-meeting handler closes it)
  const handleHangup = useCallback(async () => {
    console.log('[CALL DEBUG] 🔴 Hangup button clicked');

    // Clear any pending join timeout
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }

    shouldCloseOnLeftMeetingRef.current = true;

    const leftMeetingPromise = new Promise<void>((resolve) => {
      waitForLeftMeetingResolveRef.current = resolve;
    });

    // Trigger leave on the existing iframe
    await leaveRoom();

    // Wait for left-meeting, but don't hang forever
    const timeoutMs = 2000;
    await Promise.race([
      leftMeetingPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);

    // If left-meeting didn't arrive, force cleanup (rare)
    if (callStateRef.current !== 'ended') {
      console.log('[CALL DEBUG] ⚠️ left-meeting not observed; forcing overlay close');
      setCallState('ended');
      setErrorMessage(null);
      closeCall();
      shouldCloseOnLeftMeetingRef.current = false;
      waitForLeftMeetingResolveRef.current = null;
    }
  }, [closeCall]);

  const isVisible = state.isOpen;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      aria-hidden={!isVisible}
      className={
        "fixed inset-0 z-[9999] bg-background flex flex-col " +
        (isVisible ? "pointer-events-auto" : "pointer-events-none")
      }
      style={{
        // Keep it in the DOM always; hide via CSS only
        visibility: isVisible ? 'visible' : 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            {state.callType === 'video' ? (
              <Video className="w-4 h-4 text-primary" />
            ) : (
              <Phone className="w-4 h-4 text-primary" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {state.callType === 'video' ? 'Video Call' : 'Audio Call'}
            </p>
            <p className="text-xs text-muted-foreground">
              {errorMessage
                ? <span className="text-destructive">{errorMessage}</span>
                : callState === 'joining'
                  ? 'Connecting...'
                  : callState === 'connected'
                    ? 'Connected'
                    : 'Starting...'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleHangup}
          className="rounded-full hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Permanent Daily iframe host (ALWAYS exists) */}
      <div ref={setHostEl} className="flex-1 relative bg-black">
        {callState === 'joining' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Connecting to call...</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="p-4 flex justify-center bg-background/80 backdrop-blur-sm border-t border-border/50">
        <Button
          variant="destructive"
          size="lg"
          onClick={handleHangup}
          className="rounded-full px-8"
        >
          <Phone className="w-5 h-5 mr-2 rotate-[135deg]" />
          End Call
        </Button>
      </div>
    </motion.div>
  );
}
