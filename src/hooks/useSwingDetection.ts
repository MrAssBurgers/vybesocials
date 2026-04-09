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
  const requiresUserGesture = typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function';

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

  // Stable handleMotion — all deps are refs or stable primitives from options
  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    if (!enabled) return;
    const { acceleration } = event;
    if (!acceleration) return;
    const { z } = acceleration;
    if (z === null) return;

    const now = Date.now();
    if (now - lastSwingTimeRef.current < cooldown) return;

    if (z < -threshold) {
      const magnitude = Math.abs(z);
      if (!backDetectedRef.current || magnitude > backDetectedRef.current.magnitude) {
        backDetectedRef.current = { timestamp: now, magnitude };
      }
    }

    if (z > threshold && backDetectedRef.current) {
      const timeSinceBack = now - backDetectedRef.current.timestamp;
      if (timeSinceBack > 50 && timeSinceBack < swingWindow) {
        lastSwingTimeRef.current = now;
        backDetectedRef.current = null;
        haptics.impact();
        setTimeout(() => haptics.success(), 80);
        onSwingRef.current?.();
      }
    }

    if (backDetectedRef.current && now - backDetectedRef.current.timestamp > swingWindow) {
      backDetectedRef.current = null;
    }
  }, [enabled, threshold, swingWindow, cooldown]);

  const startListening = useCallback(async (promptForPermission = true) => {
    if (isListening) return;
    if (requiresUserGesture && permissionGranted !== true) {
      if (!promptForPermission) return;
      const hasPermission = await requestPermission();
      if (!hasPermission) return;
    }
    window.addEventListener('devicemotion', handleMotion);
    setIsListening(true);
  }, [requestPermission, handleMotion, isListening, permissionGranted, requiresUserGesture]);

  const stopListening = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion);
    setIsListening(false);
    backDetectedRef.current = null;
  }, [handleMotion]);

  useEffect(() => {
    if (enabled) {
      if (requiresUserGesture && permissionGranted !== true) {
        stopListening();
      } else {
        startListening(false);
      }
    } else {
      stopListening();
    }
    return () => { stopListening(); };
  }, [enabled, startListening, stopListening, permissionGranted, requiresUserGesture]);

  return {
    isListening,
    permissionGranted,
    requestPermission,
    startListening,
    stopListening,
  };
}
