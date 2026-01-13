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

  const [isJoiningUi, setIsJoiningUi] = useState(false);
  const [isConnectedUi, setIsConnectedUi] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

      daily.on('joined-meeting', () => {
        console.log('[CALL DEBUG] joined-meeting');
        setIsConnectedUi(true);
        setIsJoiningUi(false);
        setErrorMessage(null);
      });

      daily.on('left-meeting', () => {
        console.log('[CALL DEBUG] left-meeting');
        setIsConnectedUi(false);
        setIsJoiningUi(false);
        setErrorMessage(null);
        // Hide overlay UI if it is still visible
        closeCall();
      });

      daily.on('error', (event: any) => {
        const reason = event?.errorMsg || event?.error?.msg || 'Unknown Daily error';
        console.error('[CALL DEBUG] daily error', event);
        setErrorMessage(String(reason));
        toast.error(`Call error: ${String(reason)}`);
        // Failure recovery: leave + hide, allow retry on same iframe
        void (async () => {
          await leaveRoom();
          closeCall();
        })();
      });
    }
  }, [closeCall]);

  // Join whenever we open a call (using the SAME iframe)
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
      console.log('[CALL DEBUG] openCall flow (single iframe) join()', { roomUrl: state.roomUrl });

      // UI reset before starting new call (no iframe recreation)
      setIsJoiningUi(true);
      setIsConnectedUi(false);
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
        } catch (permError: any) {
          const msg = state.callType === 'video'
            ? 'Microphone and camera permission required'
            : 'Microphone permission required';
          console.error('[CALL DEBUG] Media permission denied:', permError);
          setErrorMessage(permError?.message ? `${msg}: ${permError.message}` : msg);
          toast.error(msg);
          await leaveRoom();
          closeCall();
          return;
        }

        // Join on the existing iframe
        await joinRoom(state.roomUrl);

        if (cancelled) return;
      } catch (e: any) {
        const reason = e?.message || String(e);
        console.error('[CALL DEBUG] join failed:', e);
        setErrorMessage(reason);
        toast.error(`Failed to start call: ${reason}`);

        // FAILURE RECOVERY: leave + hide, allow retry immediately on same iframe
        await leaveRoom();
        closeCall();
      } finally {
        if (!cancelled) setIsJoiningUi(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [state.isOpen, state.roomUrl, state.callType, closeCall]);

  const handleHangup = useCallback(async () => {
    console.log('[CALL DEBUG] Hangup clicked');
    // ENDING A CALL: leave() + hide (do NOT destroy iframe)
    await leaveRoom();
    setIsConnectedUi(false);
    setIsJoiningUi(false);
    setErrorMessage(null);
    closeCall();
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
                : isJoiningUi
                  ? 'Connecting...'
                  : isConnectedUi
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
        {isJoiningUi && (
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
