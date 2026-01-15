import { useEffect, useRef, useCallback, useState } from 'react';

export type CaptureEvent = {
  type: 'screenshot' | 'screen_recording_start' | 'screen_recording_stop' | 'possible_recording';
  timestamp: Date;
  confidence: 'high' | 'medium' | 'low';
};

interface UseScreenCaptureOptions {
  enabled?: boolean;
  onCapture?: (event: CaptureEvent) => void;
}

export function useScreenCapture({ enabled = true, onCapture }: UseScreenCaptureOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  
  // Signal tracking for screenshot detection
  const lastBlurTime = useRef<number>(0);
  const lastVisibilityHidden = useRef<number>(0);
  const wasHiddenRecently = useRef(false);
  const navigationOccurred = useRef(false);
  const cooldownRef = useRef(false);
  const isActivelyViewingChat = useRef(true);
  const recordingCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Prevent duplicate detections with cooldown
  const triggerCapture = useCallback((event: CaptureEvent) => {
    // Don't trigger if on cooldown for screenshots
    if (cooldownRef.current && event.type === 'screenshot') return;
    // Only notify on high/medium confidence
    if (event.confidence === 'low') return;
    
    console.log('[ScreenCapture] Triggered:', event.type, 'confidence:', event.confidence);
    onCapture?.(event);
    
    if (event.type === 'screenshot') {
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 3000); // 3s cooldown between screenshot detections
    }
  }, [onCapture]);

  // SCREENSHOT DETECTION - Combined signals approach (Snapchat-style)
  useEffect(() => {
    if (!enabled) return;

    let blurFocusTimeout: NodeJS.Timeout | null = null;
    
    // Track navigation to avoid false positives
    const handleBeforeUnload = () => {
      navigationOccurred.current = true;
    };
    const handlePopState = () => {
      navigationOccurred.current = true;
      setTimeout(() => { navigationOccurred.current = false; }, 1000);
    };
    const handleHashChange = () => {
      navigationOccurred.current = true;
      setTimeout(() => { navigationOccurred.current = false; }, 1000);
    };

    // Track visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastVisibilityHidden.current = Date.now();
        wasHiddenRecently.current = true;
      } else {
        // Document became visible again
        const hiddenDuration = Date.now() - lastVisibilityHidden.current;
        
        // Screenshot signal: Very brief visibility change (50-800ms)
        // Normal tab switch is usually longer
        if (wasHiddenRecently.current && hiddenDuration > 50 && hiddenDuration < 800) {
          // Wait a tiny bit to check if it's combined with blur/focus
          setTimeout(() => {
            if (!navigationOccurred.current && isActivelyViewingChat.current) {
              // Check if blur also happened around same time
              const blurWasRecent = (Date.now() - lastBlurTime.current) < 1000;
              
              if (blurWasRecent) {
                console.log('[ScreenCapture] Screenshot pattern detected: visibility + blur combo');
                triggerCapture({
                  type: 'screenshot',
                  timestamp: new Date(),
                  confidence: 'high'
                });
              }
            }
          }, 100);
        }
        wasHiddenRecently.current = false;
      }
    };

    // Track blur/focus for screenshot detection
    const handleBlur = () => {
      lastBlurTime.current = Date.now();
    };

    const handleFocus = () => {
      const blurDuration = Date.now() - lastBlurTime.current;
      
      // Screenshot pattern: Very brief blur (100-1000ms) 
      // Combined with no navigation and active chat viewing
      if (blurDuration > 100 && blurDuration < 1000 && !navigationOccurred.current && isActivelyViewingChat.current) {
        // Clear any pending check
        if (blurFocusTimeout) clearTimeout(blurFocusTimeout);
        
        // Wait briefly to combine with visibility signal
        blurFocusTimeout = setTimeout(() => {
          const visibilityWasRecent = (Date.now() - lastVisibilityHidden.current) < 1500;
          
          if (visibilityWasRecent) {
            console.log('[ScreenCapture] Screenshot pattern: blur+focus combo, duration:', blurDuration);
            triggerCapture({
              type: 'screenshot',
              timestamp: new Date(),
              confidence: 'high'
            });
          }
        }, 150);
      }
    };

    // Reset navigation flag periodically
    const resetInterval = setInterval(() => {
      navigationOccurred.current = false;
    }, 2000);

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearInterval(resetInterval);
      if (blurFocusTimeout) clearTimeout(blurFocusTimeout);
    };
  }, [enabled, triggerCapture]);

  // SCREEN RECORDING DETECTION - Override getDisplayMedia
  useEffect(() => {
    if (!enabled) return;

    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
    
    if (originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = async function(constraints) {
        // Recording started
        setIsRecording(true);
        triggerCapture({
          type: 'screen_recording_start',
          timestamp: new Date(),
          confidence: 'high'
        });

        try {
          const stream = await originalGetDisplayMedia.call(this, constraints);
          
          // Listen for track end to detect recording stop
          stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
              setIsRecording(false);
              triggerCapture({
                type: 'screen_recording_stop',
                timestamp: new Date(),
                confidence: 'high'
              });
            });
          });

          return stream;
        } catch (error) {
          setIsRecording(false);
          throw error;
        }
      };
    }

    // Check for Screen Capture API if available
    const checkScreenCapture = () => {
      // Try to detect if screen is being captured via experimental APIs
      // This is very limited in browsers
      try {
        // @ts-ignore - experimental API
        if (navigator.mediaDevices?.getDisplayMedia && 'getCapabilities' in MediaStreamTrack.prototype) {
          // Some browsers expose capture state
        }
      } catch {
        // Silent fail - detection is best-effort
      }
    };

    // Periodic check for any recording indicators
    recordingCheckInterval.current = setInterval(checkScreenCapture, 5000);

    return () => {
      if (originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      if (recordingCheckInterval.current) {
        clearInterval(recordingCheckInterval.current);
      }
    };
  }, [enabled, triggerCapture]);

  // Track if user is actively in a chat (for context)
  const setActivelyViewingChat = useCallback((active: boolean) => {
    isActivelyViewingChat.current = active;
  }, []);

  return {
    isRecording,
    setActivelyViewingChat
  };
}
