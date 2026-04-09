import { useState, useEffect, useCallback, useRef } from 'react';
import { haptics } from '@/lib/haptics';

interface SwingDetectionOptions {
  enabled?: boolean;
  threshold?: number;
  swingWindow?: number;
  cooldown?: number;
  onSwing?: () => void;
}

export function useSwingDetection({
  enabled = true,
  threshold = 8,
  swingWindow = 600,
  cooldown = 2000,
  onSwing,
}: SwingDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const onSwingRef = useRef(onSwing);
  const lastSwingTimeRef = useRef(0);
  const backDetectedRef = useRef<{ timestamp: number; magnitude: number } | null>(null);
  const isListeningRef = useRef(false);
  const listenerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const requiresUserGesture = typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function';

  // Keep refs fresh
  const enabledRef = useRef(enabled);
  const thresholdRef = useRef(threshold);
  const swingWindowRef = useRef(swingWindow);
  const cooldownRef = useRef(cooldown);
  enabledRef.current = enabled;
  thresholdRef.current = threshold;
  swingWindowRef.current = swingWindow;
  cooldownRef.current = cooldown;

  useEffect(() => {
    onSwingRef.current = onSwing;
  }, [onSwing]);

  const requestPermission = useCallback(async () => {
    if (requiresUserGesture) {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        setPermissionGranted(permission === 'granted');
        return permission === 'granted';
      } catch {
        setPermissionGranted(false);
        return false;
      }
    }
    setPermissionGranted(true);
    return true;
  }, [requiresUserGesture]);

  // Single stable effect that manages the listener lifecycle
  useEffect(() => {
    const shouldListen = enabled && (!requiresUserGesture || permissionGranted === true);

    if (shouldListen && !isListeningRef.current) {
      const handler = (event: DeviceMotionEvent) => {
        if (!enabledRef.current) return;
        const { acceleration } = event;
        if (!acceleration) return;
        const { z } = acceleration;
        if (z === null) return;

        const now = Date.now();
        if (now - lastSwingTimeRef.current < cooldownRef.current) return;

        if (z < -thresholdRef.current) {
          const magnitude = Math.abs(z);
          if (!backDetectedRef.current || magnitude > backDetectedRef.current.magnitude) {
            backDetectedRef.current = { timestamp: now, magnitude };
          }
        }

        if (z > thresholdRef.current && backDetectedRef.current) {
          const timeSinceBack = now - backDetectedRef.current.timestamp;
          if (timeSinceBack > 50 && timeSinceBack < swingWindowRef.current) {
            lastSwingTimeRef.current = now;
            backDetectedRef.current = null;
            haptics.impact();
            setTimeout(() => haptics.success(), 80);
            onSwingRef.current?.();
          }
        }

        if (backDetectedRef.current && now - backDetectedRef.current.timestamp > swingWindowRef.current) {
          backDetectedRef.current = null;
        }
      };

      window.addEventListener('devicemotion', handler);
      listenerRef.current = handler;
      isListeningRef.current = true;
      setIsListening(true);

      return () => {
        window.removeEventListener('devicemotion', handler);
        listenerRef.current = null;
        isListeningRef.current = false;
        setIsListening(false);
        backDetectedRef.current = null;
      };
    } else if (!shouldListen && isListeningRef.current && listenerRef.current) {
      window.removeEventListener('devicemotion', listenerRef.current);
      listenerRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      backDetectedRef.current = null;
    }

    return undefined;
  }, [enabled, permissionGranted, requiresUserGesture]);

  const startListening = useCallback(async (promptForPermission = true) => {
    if (isListeningRef.current) return;
    if (requiresUserGesture && permissionGranted !== true) {
      if (!promptForPermission) return;
      await requestPermission();
    }
  }, [requestPermission, permissionGranted, requiresUserGesture]);

  const stopListening = useCallback(() => {
    if (listenerRef.current) {
      window.removeEventListener('devicemotion', listenerRef.current);
      listenerRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
    backDetectedRef.current = null;
  }, []);

  return {
    isListening,
    permissionGranted,
    requestPermission,
    startListening,
    stopListening,
  };
}
