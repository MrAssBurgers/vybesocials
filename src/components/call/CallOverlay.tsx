import { useRef, useEffect, useCallback, useState } from 'react';
import { useCallOverlay } from './CallOverlayContext';
import { X, Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { toast } from 'sonner';

export function CallOverlay() {
  const { state, closeCall } = useCallOverlay();
  const containerRef = useRef<HTMLDivElement>(null);
  const dailyRef = useRef<DailyCall | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const hasJoinedRef = useRef(false);

  // Cleanup function to destroy Daily iframe
  const cleanup = useCallback(async () => {
    if (dailyRef.current) {
      try {
        await dailyRef.current.leave();
      } catch (e) {
        // Ignore leave errors
      }
      try {
        await dailyRef.current.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
      dailyRef.current = null;
    }
    hasJoinedRef.current = false;
    setIsConnected(false);
    setIsJoining(false);
  }, []);

  // Handle hangup
  const handleHangup = useCallback(async () => {
    await cleanup();
    closeCall();
  }, [cleanup, closeCall]);

  // Initialize Daily iframe when overlay opens
  useEffect(() => {
    if (!state.isOpen || !state.roomUrl || !containerRef.current) {
      return;
    }

    // Guard: if iframe already exists, do nothing
    if (dailyRef.current) {
      console.log('Daily iframe already exists, skipping creation');
      return;
    }

    // Guard: if already joined, do nothing
    if (hasJoinedRef.current) {
      console.log('Already joined room, skipping');
      return;
    }

    const initDaily = async () => {
      setIsJoining(true);

      try {
        // Request mic permission BEFORE join
        try {
          await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: state.callType === 'video'
          });
        } catch (permError) {
          console.error('Media permission denied:', permError);
          toast.error('Microphone permission is required for calls');
          closeCall();
          return;
        }

        // Create the Daily iframe using DailyIframe.createFrame
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

        // Set up event listeners
        daily.on('joined-meeting', () => {
          console.log('Successfully joined meeting');
          setIsConnected(true);
          setIsJoining(false);
          hasJoinedRef.current = true;
        });

        daily.on('left-meeting', () => {
          console.log('Left meeting');
          handleHangup();
        });

        daily.on('error', (event) => {
          console.error('Daily error:', event);
          toast.error('Call error occurred');
          handleHangup();
        });

        // Join ONLY once using join({ url: roomUrl })
        await daily.join({ url: state.roomUrl });

      } catch (error) {
        console.error('Failed to initialize Daily:', error);
        toast.error('Failed to start call');
        await cleanup();
        closeCall();
      }
    };

    initDaily();

    // Cleanup on unmount or when overlay closes
    return () => {
      cleanup();
    };
  }, [state.isOpen, state.roomUrl, state.callType, closeCall, cleanup, handleHangup]);

  // Cleanup when overlay closes
  useEffect(() => {
    if (!state.isOpen && dailyRef.current) {
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
                  {isJoining ? 'Connecting...' : isConnected ? 'Connected' : 'Starting...'}
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
