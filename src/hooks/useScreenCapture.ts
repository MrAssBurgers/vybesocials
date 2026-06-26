import { useEffect, useRef, useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export type CaptureEvent = {
  type: 'screenshot' | 'screen_recording_start' | 'screen_recording_stop' | 'possible_recording';
  timestamp: Date;
  confidence: 'high' | 'medium' | 'low';
  platform: 'desktop' | 'pwa' | 'native' | 'unknown';
};

interface UseScreenCaptureOptions {
  enabled?: boolean;
  onCapture?: (event: CaptureEvent) => void;
}

// Detect runtime environment
function detectEnvironment(): 'desktop' | 'pwa' | 'native' | 'unknown' {
  // Check if running as native Capacitor app
  if (Capacitor.isNativePlatform()) {
    return 'native';
  }
  
  // Check if running as PWA (standalone mode)
  const isStandalone = 
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  
  if (isStandalone) {
    return 'pwa';
  }
  
  // Check if mobile browser (web app on mobile)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    return 'pwa'; // Treat mobile web as PWA-like
  }
  
  return 'desktop';
}

// Detect platform for platform-specific detection
function detectPlatform(): 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown' {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  
  if (/iphone|ipad|ipod/.test(ua) || (/mac/.test(platform) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  if (/mac/.test(platform)) {
    return 'macos';
  }
  if (/win/.test(platform)) {
    return 'windows';
  }
  if (/linux/.test(platform)) {
    return 'linux';
  }
  return 'unknown';
}

export function useScreenCapture({ enabled = true, onCapture }: UseScreenCaptureOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  
  // Environment detection (cached)
  const environmentRef = useRef(detectEnvironment());
  const platformRef = useRef(detectPlatform());
  
  // Signal tracking for screenshot detection
  const lastBlurTime = useRef<number>(0);
  const lastVisibilityHidden = useRef<number>(0);
  const wasHiddenRecently = useRef(false);
  const navigationOccurred = useRef(false);
  const cooldownRef = useRef(false);
  const isActivelyViewingChat = useRef(true);
  const recordingCheckInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Mobile-specific tracking
  const lastWindowHeight = useRef(window.innerHeight);
  const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Prevent duplicate detections with cooldown
  const triggerCapture = useCallback((event: Omit<CaptureEvent, 'platform'>) => {
    // Don't trigger if on cooldown for screenshots
    if (cooldownRef.current && event.type === 'screenshot') return;
    // Only notify on high/medium confidence
    if (event.confidence === 'low') return;
    
    const fullEvent: CaptureEvent = {
      ...event,
      platform: environmentRef.current
    };
    
    console.log('[ScreenCapture] Triggered:', fullEvent.type, 'confidence:', fullEvent.confidence, 'env:', fullEvent.platform);
    onCapture?.(fullEvent);
    
    if (event.type === 'screenshot') {
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 3000); // 3s cooldown between screenshot detections
    }
  }, [onCapture]);

  // ===== DESKTOP KEYBOARD DETECTION =====
  useEffect(() => {
    if (!enabled) return;
    const env = environmentRef.current;
    const platform = platformRef.current;
    
    // Only run keyboard detection on desktop
    if (env !== 'desktop') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Windows/Linux PrintScreen
      if (e.key === 'PrintScreen') {
        console.log('[ScreenCapture:Desktop] PrintScreen detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
        return;
      }
      
      // Mac screenshot shortcuts: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
      if (platform === 'macos' && e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        console.log('[ScreenCapture:Desktop] Mac screenshot shortcut:', e.key);
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
        return;
      }
      
      // Windows Snipping Tool: Win+Shift+S
      if (platform === 'windows' && e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        console.log('[ScreenCapture:Desktop] Win+Shift+S detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
        return;
      }
      
      // Linux screenshot shortcuts (Gnome: PrtSc, Shift+PrtSc)
      if (platform === 'linux' && (e.key === 'Print' || (e.shiftKey && e.key === 'Print'))) {
        console.log('[ScreenCapture:Desktop] Linux screenshot detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
      }
    };

    // Listen on both keydown and keyup (PrintScreen fires on keyup on some systems)
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyDown, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
    };
  }, [enabled, triggerCapture]);

  // ===== CLIPBOARD DETECTION (Desktop/PWA) =====
  useEffect(() => {
    if (!enabled) return;
    const env = environmentRef.current;
    
    // Works on desktop and PWA
    if (env === 'native') return;

    const handleCopy = (e: ClipboardEvent) => {
      // Check if clipboard contains image data (screenshot)
      if (e.clipboardData?.types.includes('image/png') || e.clipboardData?.types.includes('image/jpeg')) {
        console.log('[ScreenCapture] Clipboard image detected');
        triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [enabled, triggerCapture]);

  // ===== VISIBILITY/FOCUS DETECTION (PWA & Mobile Web) =====
  useEffect(() => {
    if (!enabled) return;
    const env = environmentRef.current;
    const platform = platformRef.current;
    
    // This is the primary detection method for PWA/mobile web
    if (env !== 'pwa') return;

    let blurFocusTimeout: NodeJS.Timeout | null = null;
    
    // Track navigation to avoid false positives
    const handleBeforeUnload = () => {
      navigationOccurred.current = true;
    };
    const handlePopState = () => {
      navigationOccurred.current = true;
      setTimeout(() => { navigationOccurred.current = false; }, 1000);
    };

    // iOS-specific: screenshots cause brief visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastVisibilityHidden.current = Date.now();
        wasHiddenRecently.current = true;
      } else {
        const hiddenDuration = Date.now() - lastVisibilityHidden.current;
        
        // iOS screenshot pattern: 50-800ms visibility change
        if (platform === 'ios' && wasHiddenRecently.current && hiddenDuration > 50 && hiddenDuration < 800) {
          if (!navigationOccurred.current && isActivelyViewingChat.current) {
            console.log('[ScreenCapture:iOS] Screenshot pattern: visibility change', hiddenDuration, 'ms');
            triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'high' });
          }
        }
        
        // Android screenshot pattern: slightly longer, 100-1500ms
        if (platform === 'android' && wasHiddenRecently.current && hiddenDuration > 100 && hiddenDuration < 1500) {
          const blurWasRecent = (Date.now() - lastBlurTime.current) < 2000;
          if (blurWasRecent && !navigationOccurred.current && isActivelyViewingChat.current) {
            console.log('[ScreenCapture:Android] Screenshot pattern: visibility + blur combo');
            triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'medium' });
          }
        }
        
        wasHiddenRecently.current = false;
      }
    };

    // Track blur/focus for combined signal detection
    const handleBlur = () => {
      lastBlurTime.current = Date.now();
    };

    const handleFocus = () => {
      const blurDuration = Date.now() - lastBlurTime.current;
      
      // Very brief blur (100-600ms) combined with visibility = likely screenshot
      if (blurDuration > 100 && blurDuration < 600 && !navigationOccurred.current && isActivelyViewingChat.current) {
        if (blurFocusTimeout) clearTimeout(blurFocusTimeout);
        
        blurFocusTimeout = setTimeout(() => {
          const visibilityWasRecent = (Date.now() - lastVisibilityHidden.current) < 1500;
          
          if (visibilityWasRecent) {
            console.log('[ScreenCapture:PWA] Screenshot pattern: blur+focus combo', blurDuration, 'ms');
            triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'medium' });
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
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearInterval(resetInterval);
      if (blurFocusTimeout) clearTimeout(blurFocusTimeout);
    };
  }, [enabled, triggerCapture]);

  // ===== RESIZE DETECTION (iOS screenshot animation causes brief resize) =====
  useEffect(() => {
    if (!enabled) return;
    const env = environmentRef.current;
    const platform = platformRef.current;
    
    // Only for iOS PWA/web — skip in DMs (layout/keyboard resize looks like screenshots).
    if (env === 'desktop' || platform !== 'ios') return;

    const handleResize = () => {
      if (document.documentElement.getAttribute('data-dm-active') === 'true') return;
      if (document.documentElement.getAttribute('data-chat-shield') === 'blocking') return;
      const currentHeight = window.innerHeight;
      const heightDiff = Math.abs(currentHeight - lastWindowHeight.current);
      
      // iOS screenshot causes a brief height change of ~20-80px
      if (heightDiff > 15 && heightDiff < 100) {
        if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
        
        resizeDebounceRef.current = setTimeout(() => {
          // Check if height returned to normal (screenshot flash)
          if (Math.abs(window.innerHeight - lastWindowHeight.current) < 10) {
            console.log('[ScreenCapture:iOS] Resize pattern detected:', heightDiff, 'px');
            triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'medium' });
          }
          lastWindowHeight.current = window.innerHeight;
        }, 300);
      } else {
        lastWindowHeight.current = currentHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    };
  }, [enabled, triggerCapture]);

  // ===== NATIVE APP DETECTION (Capacitor) =====
  useEffect(() => {
    if (!enabled) return;
    const env = environmentRef.current;
    
    if (env !== 'native') return;

    // For native apps, we rely on Capacitor plugins
    // The app can listen for OS-level screenshot events
    // This is a placeholder - actual implementation requires native plugin
    
    // iOS uses App lifecycle events - screenshot causes app to briefly go to background
    const handleAppStateChange = () => {
      // In Capacitor, we'd use App.addListener('appStateChange', ...)
      // For now, use visibility change as fallback
    };

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const hiddenTime = Date.now() - lastVisibilityHidden.current;
        // Native screenshot is very fast: 50-300ms
        if (hiddenTime > 50 && hiddenTime < 300) {
          console.log('[ScreenCapture:Native] App resumed quickly, possible screenshot');
          triggerCapture({ type: 'screenshot', timestamp: new Date(), confidence: 'medium' });
        }
      } else {
        lastVisibilityHidden.current = Date.now();
      }
    });

    return () => {};
  }, [enabled, triggerCapture]);

  // ===== SCREEN RECORDING DETECTION (getDisplayMedia override) =====
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
    setActivelyViewingChat,
    environment: environmentRef.current,
    platform: platformRef.current
  };
}
