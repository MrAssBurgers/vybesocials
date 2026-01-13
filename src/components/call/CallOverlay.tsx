import { useRef, useEffect, useCallback, useState } from 'react';
import { useCallOverlay } from './CallOverlayContext';
import { X, Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { toast } from 'sonner';

export function CallOverlay() {
  const { state, closeCall, cleanupRef } = useCallOverlay();
  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cleanup function to destroy Daily iframe - always force destroy
  const cleanup = useCallback(async () => {
    console.log('[CALL DEBUG] cleanup called, dailyRef:', !!dailyRef.current);
    
    if (dailyRef.current) {
      try {
        console.log('[CALL DEBUG] Leaving meeting...');
        await dailyRef.current.leave();
      } catch (e) {
        console.log('[CALL DEBUG] Leave error (ignored):', e);
      }
      try {
        console.log('[CALL DEBUG] Destroying iframe...');
        await dailyRef.current.destroy();
      } catch (e) {
        console.log('[CALL DEBUG] Destroy error (ignored):', e);
      }
      dailyRef.current = null;
    }
    
    // Always reset all state
    setIsConnected(false);
    setIsJoining(false);
    setErrorMessage(null);
    console.log('[CALL DEBUG] Cleanup complete, all refs and state reset');
  }, []);

  // Register cleanup function with context so it can be called from openCall
  useEffect(() => {
    cleanupRef.current = cleanup;
    return () => {
      cleanupRef.current = null;
    };
  }, [cleanup, cleanupRef]);

  // Handle hangup
  const handleHangup = useCallback(async () => {
    console.log('[CALL DEBUG] handleHangup called');
    await cleanup();
    closeCall();
  }, [cleanup, closeCall]);

  // Initialize Daily iframe when overlay opens
  useEffect(() => {
    console.log('[CALL DEBUG] CallOverlay useEffect triggered', { 
      isOpen: state.isOpen, 
      roomUrl: state.roomUrl,
      hasContainer: !!containerRef.current,
      hasExistingDaily: !!dailyRef.current
    });
    
    // Only proceed if overlay is open and we have a roomUrl
    if (!state.isOpen) {
      console.log('[CALL DEBUG] Overlay not open, returning');
      return;
    }
    
    if (!state.roomUrl) {
      console.log('[CALL DEBUG] No roomUrl provided, returning');
      setErrorMessage('No room URL provided');
      return;
    }

    // Wait for container to be ready
    if (!containerRef.current) {
      console.log('[CALL DEBUG] Container ref not ready, will retry on next render');
      return;
    }

    // If we already have a Daily instance for THIS room, skip
    // This prevents re-init on re-renders, but allows new calls
    if (dailyRef.current) {
      console.log('[CALL DEBUG] Daily instance exists, checking if same room...');
      // The cleanup should have been called before openCall sets new state
      // If we still have an instance, it means we're in the same call
      return;
    }

    const initDaily = async () => {
      console.log('[CALL DEBUG] initDaily starting...');
      setIsJoining(true);
      setErrorMessage(null);

      try {
        // Request mic permission BEFORE join
        console.log('[CALL DEBUG] Requesting media permissions...');
        try {
          await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: state.callType === 'video'
          });
          console.log('[CALL DEBUG] Media permissions granted');
        } catch (permError: any) {
          const errMsg = `Microphone permission denied: ${permError?.message || permError}`;
          console.error('[CALL DEBUG]', errMsg);
          setErrorMessage(errMsg);
          toast.error('Microphone permission is required for calls');
          await cleanup();
          closeCall();
          return;
        }

        console.log('[CALL DEBUG] Creating Daily iframe...');
        // Create the Daily iframe
        const daily = DailyIframe.createFrame(containerRef.current!, {
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
        console.log('[CALL DEBUG] Daily iframe created');

        // Set up event listeners
        daily.on('joined-meeting', () => {
          console.log('[CALL DEBUG] Successfully joined meeting');
          setIsConnected(true);
          setIsJoining(false);
          setErrorMessage(null);
        });

        daily.on('left-meeting', () => {
          console.log('[CALL DEBUG] Left meeting event');
          handleHangup();
        });

        daily.on('error', (event) => {
          const errMsg = `Daily error: ${JSON.stringify(event)}`;
          console.error('[CALL DEBUG]', errMsg);
          setErrorMessage(errMsg);
          toast.error(`Call error: ${event?.errorMsg || 'Unknown error'}`);
          handleHangup();
        });

        // Join the room
        console.log('[CALL DEBUG] Joining room:', state.roomUrl);
        await daily.join({ url: state.roomUrl });
        console.log('[CALL DEBUG] Join call completed');

      } catch (error: any) {
        const errMsg = `Failed to initialize Daily: ${error?.message || error}`;
        console.error('[CALL DEBUG]', errMsg);
        setErrorMessage(errMsg);
        toast.error(`Failed to start call: ${error?.message || 'Unknown error'}`);
        await cleanup();
        closeCall();
      }
    };

    initDaily();

    // Cleanup on unmount
    return () => {
      console.log('[CALL DEBUG] CallOverlay effect cleanup (unmount or deps change)');
      // Don't auto-cleanup here as it may interrupt active calls on re-renders
    };
  }, [state.isOpen, state.roomUrl, state.callType, closeCall, cleanup, handleHangup]);

  // Cleanup when overlay closes
  useEffect(() => {
    if (!state.isOpen && dailyRef.current) {
      console.log('[CALL DEBUG] Overlay closed, cleaning up...');
      cleanup();
    }
  }, [state.isOpen, cleanup]);

  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] bg-background flex flex-col"
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
                    : isJoining 
                      ? 'Connecting...' 
                      : isConnected 
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

          {/* Daily iframe container */}
          <div 
            ref={containerRef} 
            className="flex-1 relative bg-black"
          >
            {/* Loading state shown until iframe loads */}
            {isJoining && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Connecting to call...</p>
                </div>
              </div>
            )}
            
            {/* Error state */}
            {errorMessage && !isJoining && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="text-center space-y-4 p-4">
                  <p className="text-sm text-destructive font-mono break-all">{errorMessage}</p>
                  <Button variant="outline" onClick={handleHangup}>Close</Button>
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
      )}
    </AnimatePresence>
  );
}
