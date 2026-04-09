import { useState, useEffect, useCallback, useRef } from 'react';
import { haptics } from '@/lib/haptics';

interface BumpDetectionOptions {
  enabled?: boolean;
  threshold?: number;
  cooldown?: number;
  onBump?: () => void;
}

export function useBumpDetection({
  enabled = true,
  threshold = 15,
  cooldown = 3000,
  onBump,
}: BumpDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const onBumpRef = useRef(onBump);
  const lastBumpTimeRef = useRef(0);
  const isListeningRef = useRef(false);
  const listenerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const requiresUserGesture = typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function';

  const enabledRef = useRef(enabled);
  const thresholdRef = useRef(threshold);
  const cooldownRef = useRef(cooldown);
  enabledRef.current = enabled;
  thresholdRef.current = threshold;
  cooldownRef.current = cooldown;

  useEffect(() => {
    onBumpRef.current = onBump;
  }, [onBump]);

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

  useEffect(() => {
    const shouldListen = enabled && (!requiresUserGesture || permissionGranted === true);

    if (shouldListen && !isListeningRef.current) {
      const handler = (event: DeviceMotionEvent) => {
        if (!enabledRef.current) return;
        const { accelerationIncludingGravity } = event;
        if (!accelerationIncludingGravity) return;
        const { x, y, z } = accelerationIncludingGravity;
        if (x === null || y === null || z === null) return;

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const actualAcceleration = Math.abs(magnitude - 9.8);
        const now = Date.now();

        if (actualAcceleration > thresholdRef.current) {
          if (now - lastBumpTimeRef.current > cooldownRef.current) {
            lastBumpTimeRef.current = now;
            haptics.impact();
            setTimeout(() => haptics.success(), 80);
            onBumpRef.current?.();
          }
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
      };
    } else if (!shouldListen && isListeningRef.current && listenerRef.current) {
      window.removeEventListener('devicemotion', listenerRef.current);
      listenerRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
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
  }, []);

  return {
    isListening,
    permissionGranted,
    requestPermission,
    startListening,
    stopListening,
  };
}
