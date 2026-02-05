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

  // KEYBOARD SHORTCUT DETECTION for screenshots
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Windows/Linux PrintScreen
      if (e.key === 'PrintScreen') {
        console.log('[ScreenCapture] PrintScreen keyboard shortcut detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
        return;
      }
      
      // Mac screenshot shortcuts: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        console.log('[ScreenCapture] Mac screenshot shortcut detected:', e.key);
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
        return;
      }
      
      // Windows Snipping Tool: Win+Shift+S
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        console.log('[ScreenCapture] Win+Shift+S (Snipping Tool) detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyDown, true); // PrintScreen fires on keyup on some systems
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
    };
  }, [enabled, triggerCapture]);

  // SCREENSHOT DETECTION - Combined signals approach (Snapchat-style) with relaxed timings
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

    // Track visibility changes with RELAXED timing thresholds
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastVisibilityHidden.current = Date.now();
        wasHiddenRecently.current = true;
      } else {
        // Document became visible again
        const hiddenDuration = Date.now() - lastVisibilityHidden.current;
        
        // RELAXED: Screenshot signal: 50-2000ms (was 50-800ms)
        // This captures tab switches where user takes screenshot and returns
        if (wasHiddenRecently.current && hiddenDuration > 50 && hiddenDuration < 2000) {
          setTimeout(() => {
            if (!navigationOccurred.current && isActivelyViewingChat.current) {
              const blurWasRecent = (Date.now() - lastBlurTime.current) < 2500;
              
              if (blurWasRecent) {
                // Combined signals = high confidence
                console.log('[ScreenCapture] Screenshot pattern: visibility + blur combo');
                triggerCapture({
                  type: 'screenshot',
                  timestamp: new Date(),
                  confidence: 'high'
                });
              } else if (hiddenDuration < 1000) {
                // Single visibility signal with very short duration = medium confidence
                console.log('[ScreenCapture] Screenshot pattern: quick visibility change only');
                triggerCapture({
                  type: 'screenshot',
                  timestamp: new Date(),
                  confidence: 'medium'
                });
              }
            }
          }, 100);
        }
        wasHiddenRecently.current = false;
      }
    };

    // Track blur/focus for screenshot detection with RELAXED timing
    const handleBlur = () => {
      lastBlurTime.current = Date.now();
    };

    const handleFocus = () => {
      const blurDuration = Date.now() - lastBlurTime.current;
      
      // RELAXED: Screenshot pattern: 100-3000ms blur (was 100-1000ms)
      // This captures longer tab switches where screenshot occurs
      if (blurDuration > 100 && blurDuration < 3000 && !navigationOccurred.current && isActivelyViewingChat.current) {
        if (blurFocusTimeout) clearTimeout(blurFocusTimeout);
        
        blurFocusTimeout = setTimeout(() => {
          const visibilityWasRecent = (Date.now() - lastVisibilityHidden.current) < 2500;
          
          if (visibilityWasRecent) {
            // Combined signals = high confidence
            console.log('[ScreenCapture] Screenshot pattern: blur+focus combo, duration:', blurDuration);
            triggerCapture({
              type: 'screenshot',
              timestamp: new Date(),
              confidence: 'high'
            });
          } else if (blurDuration < 1500) {
            // Single blur signal with short duration = medium confidence
            console.log('[ScreenCapture] Screenshot pattern: quick blur only, duration:', blurDuration);
            triggerCapture({
              type: 'screenshot',
              timestamp: new Date(),
              confidence: 'medium'
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
