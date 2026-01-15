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
  const lastBlurTime = useRef<number | null>(null);
  const lastVisibilityChange = useRef<number | null>(null);
  const wasHidden = useRef(false);
  const navigationOccurred = useRef(false);
  const cooldownRef = useRef(false);
  const recordingCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Prevent duplicate detections with cooldown
  const triggerCapture = useCallback((event: CaptureEvent) => {
    if (cooldownRef.current && event.type === 'screenshot') return;
    if (event.confidence === 'low') return; // Don't notify on low confidence
    
    onCapture?.(event);
    
    if (event.type === 'screenshot') {
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 2000); // 2s cooldown between screenshot detections
    }
  }, [onCapture]);

  // Screenshot detection via combined signals
  useEffect(() => {
    if (!enabled) return;

    const handleBlur = () => {
      lastBlurTime.current = Date.now();
    };

    const handleFocus = () => {
      const now = Date.now();
      const blurDuration = lastBlurTime.current ? now - lastBlurTime.current : Infinity;
      const visibilityDuration = lastVisibilityChange.current ? now - lastVisibilityChange.current : Infinity;
      
      // Screenshot pattern: brief blur (<1s) + visibility change + no navigation
      if (
        blurDuration < 1000 &&
        blurDuration > 50 && // Ignore instant blur/focus
        visibilityDuration < 1500 &&
        wasHidden.current &&
        !navigationOccurred.current
      ) {
        const confidence = blurDuration < 500 ? 'high' : 'medium';
        triggerCapture({
          type: 'screenshot',
          timestamp: new Date(),
          confidence
        });
      }

      // Reset state
      wasHidden.current = false;
      navigationOccurred.current = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden.current = true;
        lastVisibilityChange.current = Date.now();
      } else {
        // Check for screenshot pattern on visibility restore
        const now = Date.now();
        const hiddenDuration = lastVisibilityChange.current ? now - lastVisibilityChange.current : Infinity;
        
        if (hiddenDuration < 800 && hiddenDuration > 50 && !navigationOccurred.current) {
          triggerCapture({
            type: 'screenshot',
            timestamp: new Date(),
            confidence: hiddenDuration < 400 ? 'high' : 'medium'
          });
        }
      }
    };

    // Track navigation to avoid false positives
    const handleBeforeUnload = () => {
      navigationOccurred.current = true;
    };

    const handlePopState = () => {
      navigationOccurred.current = true;
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled, triggerCapture]);

  // Screen recording detection via MediaDevices API
  useEffect(() => {
    if (!enabled) return;

    // Override getDisplayMedia to detect screen recording
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

    // Check for existing screen capture (browser support varies)
    const checkExistingCapture = async () => {
      try {
        // Some browsers expose this info
        if ('getDisplayMedia' in navigator.mediaDevices) {
          // We can only detect when someone requests capture from this page
          // External capture tools are not detectable
        }
      } catch {
        // Silently fail - detection is best-effort
      }
    };

    checkExistingCapture();

    // Periodic check for recording indicators (where available)
    recordingCheckInterval.current = setInterval(() => {
      // Check if any media streams are active with display capture
      // This is limited by browser APIs
    }, 5000);

    return () => {
      if (originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      if (recordingCheckInterval.current) {
        clearInterval(recordingCheckInterval.current);
      }
    };
  }, [enabled, triggerCapture]);

  // iOS-specific: detect potential screenshots via orientation/resize patterns
  useEffect(() => {
    if (!enabled) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    let lastResize = 0;
    const handleResize = () => {
      const now = Date.now();
      const timeSinceLastResize = now - lastResize;
      
      // iOS screenshot causes brief resize events in some cases
      if (timeSinceLastResize < 100 && wasHidden.current) {
        triggerCapture({
          type: 'screenshot',
          timestamp: new Date(),
          confidence: 'medium'
        });
      }
      
      lastResize = now;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [enabled, triggerCapture]);

  return {
    isRecording
  };
}
