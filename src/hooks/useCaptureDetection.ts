import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  const frameDropCount = useRef(0);
  const rafId = useRef<number>(0);
  const blurCount = useRef(0);
  const blurTimer = useRef<NodeJS.Timeout>();

  const addSignal = useCallback((type: string) => {
    const now = Date.now();
    signals.current.push({ type, timestamp: now });

    // Keep only last 10 signals
    if (signals.current.length > 10) {
      signals.current = signals.current.slice(-10);
    }
  }, []);

  const reportCapture = useCallback(async (type: CaptureType, detectedSignals: string[]) => {
    if (!user?.id || !senderId || captured) return;
    if (user.id === senderId) return; // Don't report on own media

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

    // Screenshot: keyboard shortcut detected
    if (signalTypes.includes('key_capture')) {
      reportCapture('screenshot', signalTypes);
      return;
    }

    // Confirmed capture: 2+ different signal types within 5s
    if (signalTypes.length >= 2) {
      const hasBlur = signalTypes.includes('blur') || signalTypes.includes('visibility');
      const hasFrameDrop = signalTypes.includes('frame_drop');
      const hasDeviceChange = signalTypes.includes('device_change');

      if (hasBlur && (hasFrameDrop || hasDeviceChange)) {
        reportCapture('screen_record', signalTypes);
        return;
      }

      if (signalTypes.length >= 2) {
        reportCapture('possible_capture', signalTypes);
        return;
      }
    }

    // Single blur/visibility signal = suspected
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
    frameDropCount.current = 0;

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

    // 2. Visibility change detection
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const elapsed = Date.now() - viewStartTime.current;
        // Only flag if within reasonable capture window (0.3s - 10s after opening)
        if (elapsed > 300 && elapsed < 10000) {
          addSignal('visibility');
          evaluateSignals();
        }
      }
    };

    // 3. Window blur/focus tracking
    const handleBlur = () => {
      const elapsed = Date.now() - viewStartTime.current;
      if (elapsed > 300) {
        blurCount.current += 1;
        addSignal('blur');

        // Multiple blur/focus cycles = suspicious
        if (blurCount.current >= 3) {
          addSignal('repeated_blur');
        }
        evaluateSignals();
      }
    };

    const handleFocus = () => {
      // Focus returning quickly after blur = capture pattern
      const lastBlur = signals.current.filter(s => s.type === 'blur').pop();
      if (lastBlur && Date.now() - lastBlur.timestamp < 1500) {
        addSignal('quick_refocus');
        evaluateSignals();
      }
    };

    // 4. Frame timing drop detection (screen recording inference)
    let consecutiveDrops = 0;
    const checkFrameTiming = (timestamp: number) => {
      if (lastFrameTime.current > 0) {
        const delta = timestamp - lastFrameTime.current;
        // Normal is ~16ms (60fps). >50ms suggests frame drops
        if (delta > 50) {
          consecutiveDrops++;
          if (consecutiveDrops >= 3) {
            addSignal('frame_drop');
            evaluateSignals();
            consecutiveDrops = 0;
          }
        } else {
          consecutiveDrops = 0;
        }
      }
      lastFrameTime.current = timestamp;
      rafId.current = requestAnimationFrame(checkFrameTiming);
    };
    rafId.current = requestAnimationFrame(checkFrameTiming);

    // 5. Media device change (recording software often triggers this)
    const handleDeviceChange = () => {
      addSignal('device_change');
      evaluateSignals();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    // Attach listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      cancelAnimationFrame(rafId.current);
      if (blurTimer.current) clearTimeout(blurTimer.current);
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

    const channel = supabase
      .channel(`capture-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'capture_events',
          filter: `sender_id=eq.${user.id}`,
        },
        async (payload) => {
          const event = payload.new as any;
          
          // Fetch viewer profile for name
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

          toast(`${icon} ${name} ${action}`, {
            duration: 5000,
          });
          haptics.warning();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
