import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

type CaptureType = 'screenshot' | 'screen_record' | 'possible_capture';
type CaptureState = 'idle' | 'viewing' | 'suspected_capture' | 'confirmed_capture';

interface CaptureDetectionOptions {
  enabled: boolean;
  senderId?: string;
  mediaId?: string;
  conversationId?: string;
  onCaptureDetected?: (type: CaptureType) => void;
}

interface CaptureSignal {
  type: string;
  timestamp: number;
}

// Detect platform once
const detectPlatform = (): 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown' => {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  if (/iphone|ipad|ipod/.test(ua) || (/mac/.test(platform) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mac/.test(platform)) return 'macos';
  if (/win/.test(platform)) return 'windows';
  if (/linux/.test(platform)) return 'linux';
  return 'unknown';
};

const PLATFORM = detectPlatform();
const IS_MOBILE = PLATFORM === 'ios' || PLATFORM === 'android';

export function useCaptureDetection({
  enabled,
  senderId,
  mediaId,
  conversationId,
  onCaptureDetected,
}: CaptureDetectionOptions) {
  const { user } = useAuth();
  const [state, setState] = useState<CaptureState>('idle');
  const [captured, setCaptured] = useState(false);
  const signals = useRef<CaptureSignal[]>([]);
  const viewStartTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const rafId = useRef<number>(0);
  const blurCount = useRef(0);
  const cooldownRef = useRef(false);

  const addSignal = useCallback((type: string) => {
    const now = Date.now();
    // Deduplicate same signal within 500ms
    const recent = signals.current.filter(s => s.type === type && now - s.timestamp < 500);
    if (recent.length > 0) return;
    
    signals.current.push({ type, timestamp: now });
    if (signals.current.length > 10) {
      signals.current = signals.current.slice(-10);
    }
  }, []);

  const reportCapture = useCallback(async (type: CaptureType, detectedSignals: string[]) => {
    if (!user?.id || !senderId || captured || cooldownRef.current) return;
    if (user.id === senderId) return;

    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 5000); // 5s cooldown

    setCaptured(true);
    setState('confirmed_capture');
    haptics.warning();
    onCaptureDetected?.(type);

    try {
      await supabase.from('capture_events').insert({
        viewer_id: user.id,
        sender_id: senderId,
        media_id: mediaId || null,
        conversation_id: conversationId || null,
        type,
        signals: detectedSignals,
        client_timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[CaptureDetection] Failed to report:', err);
    }
  }, [user?.id, senderId, mediaId, conversationId, captured, onCaptureDetected]);

  const evaluateSignals = useCallback(() => {
    const now = Date.now();
    const recentSignals = signals.current.filter(s => now - s.timestamp < 5000);
    const signalTypes = [...new Set(recentSignals.map(s => s.type))];

    // Keyboard screenshot = high confidence
    if (signalTypes.includes('key_capture')) {
      reportCapture('screenshot', signalTypes);
      return;
    }

    // Mobile visibility pattern (iOS/Android screenshot flash)
    if (IS_MOBILE && signalTypes.includes('mobile_screenshot')) {
      reportCapture('screenshot', signalTypes);
      return;
    }

    // 2+ correlated signals = recording or capture
    if (signalTypes.length >= 2) {
      const hasBlur = signalTypes.includes('blur') || signalTypes.includes('visibility');
      const hasFrameDrop = signalTypes.includes('frame_drop');
      const hasDeviceChange = signalTypes.includes('device_change');

      if (hasBlur && (hasFrameDrop || hasDeviceChange)) {
        reportCapture('screen_record', signalTypes);
        return;
      }
      if (signalTypes.length >= 3) {
        reportCapture('possible_capture', signalTypes);
        return;
      }
    }

    // Single blur/visibility = suspected only (no report)
    if (signalTypes.length === 1 && (signalTypes[0] === 'blur' || signalTypes[0] === 'visibility')) {
      setState('suspected_capture');
    }
  }, [reportCapture]);

  useEffect(() => {
    if (!enabled) {
      setState('idle');
      return;
    }

    setState('viewing');
    viewStartTime.current = Date.now();
    signals.current = [];
    setCaptured(false);
    blurCount.current = 0;
    cooldownRef.current = false;

    // 1. Keyboard shortcut detection
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen';
      const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
      const isWinSnip = e.metaKey && e.shiftKey && e.key.toLowerCase() === 's';

      if (isPrintScreen || isMacScreenshot || isWinSnip) {
        addSignal('key_capture');
        evaluateSignals();
      }
    };

    // 2. Visibility change - with mobile-specific screenshot pattern
    let lastHiddenTime = 0;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenTime = Date.now();
        const elapsed = Date.now() - viewStartTime.current;
        if (elapsed > 300 && elapsed < 30000) {
          addSignal('visibility');
        }
      } else {
        // Mobile screenshot causes very brief visibility change (50-800ms)
        const hiddenDuration = Date.now() - lastHiddenTime;
        if (IS_MOBILE && lastHiddenTime > 0 && hiddenDuration > 50 && hiddenDuration < 800) {
          addSignal('mobile_screenshot');
          evaluateSignals();
        } else {
          evaluateSignals();
        }
      }
    };

    // 3. Blur/focus tracking
    let lastBlurTime = 0;
    const handleBlur = () => {
      const elapsed = Date.now() - viewStartTime.current;
      if (elapsed > 300) {
        lastBlurTime = Date.now();
        blurCount.current += 1;
        addSignal('blur');
        if (blurCount.current >= 3) {
          addSignal('repeated_blur');
        }
        evaluateSignals();
      }
    };

    const handleFocus = () => {
      if (lastBlurTime > 0 && Date.now() - lastBlurTime < 1500) {
        addSignal('quick_refocus');
        evaluateSignals();
      }
    };

    // 4. Frame timing detection (recording inference) - desktop only
    let consecutiveDrops = 0;
    const checkFrameTiming = (timestamp: number) => {
      if (!IS_MOBILE && lastFrameTime.current > 0) {
        const delta = timestamp - lastFrameTime.current;
        if (delta > 50) {
          consecutiveDrops++;
          if (consecutiveDrops >= 5) { // Raised threshold to reduce false positives
            addSignal('frame_drop');
            evaluateSignals();
            consecutiveDrops = 0;
          }
        } else {
          consecutiveDrops = Math.max(0, consecutiveDrops - 1); // Gradual decay
        }
      }
      lastFrameTime.current = timestamp;
      rafId.current = requestAnimationFrame(checkFrameTiming);
    };
    rafId.current = requestAnimationFrame(checkFrameTiming);

    // 5. Media device change
    const handleDeviceChange = () => {
      addSignal('device_change');
      evaluateSignals();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    // 6. Clipboard image detection (desktop screenshot to clipboard)
    const handleCopy = (e: ClipboardEvent) => {
      if (e.clipboardData?.types.includes('image/png') || e.clipboardData?.types.includes('image/jpeg')) {
        addSignal('key_capture');
        evaluateSignals();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyDown, true); // PrintScreen fires on keyup sometimes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      document.removeEventListener('copy', handleCopy);
      cancelAnimationFrame(rafId.current);
    };
  }, [enabled, addSignal, evaluateSignals]);

  return { state, captured };
}

/**
 * Hook to listen for capture events on your sent media (sender side)
 */
export function useCaptureNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const channel = subscribePostgresChannel(`capture-notifications-${user.id}`, [
      {
        event: 'INSERT',
        table: 'capture_events',
        filter: `sender_id=eq.${user.id}`,
        callback: async (payload) => {
          const event = payload.new as any;
          
          const { data: viewer } = await supabase
            .from('profiles')
            .select('username, display_name')
            .eq('id', event.viewer_id)
            .single();

          const name = viewer?.display_name || viewer?.username || 'Someone';
          const icon = event.type === 'screenshot' ? '📸' : '🎥';
          const action = event.type === 'screenshot' 
            ? 'took a screenshot' 
            : event.type === 'screen_record' 
              ? 'started screen recording' 
              : 'may have captured your media';

          toast(`${icon} ${name} ${action}`, { duration: 5000 });
          haptics.warning();
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [user?.id]);
}
