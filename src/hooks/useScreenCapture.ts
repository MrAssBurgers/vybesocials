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
  // NOTE: Web browsers cannot reliably detect screenshots - this is disabled
  // to prevent false positives from normal tab switching behavior.
  // Only screen recording detection (via getDisplayMedia override) is active.
  useEffect(() => {
    if (!enabled) return;

    // Track navigation to avoid false positives in any future detection
    const handleBeforeUnload = () => {
      navigationOccurred.current = true;
    };

    const handlePopState = () => {
      navigationOccurred.current = true;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled]);

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

  // iOS-specific screenshot detection is disabled due to high false positive rate
  // from normal resize events and orientation changes.

  return {
    isRecording
  };
}
