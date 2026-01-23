import { useState, useEffect, useCallback, useRef } from 'react';
import { haptics } from '@/lib/haptics';

interface BumpDetectionOptions {
  enabled?: boolean;
  threshold?: number; // Acceleration threshold to detect a bump
  cooldown?: number; // Cooldown period after a bump is detected (ms)
  onBump?: () => void;
}

export function useBumpDetection({
  enabled = true,
  threshold = 15, // Strong single shake threshold
  cooldown = 3000, // 3 seconds cooldown
  onBump,
}: BumpDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [lastBumpTime, setLastBumpTime] = useState<number>(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const onBumpRef = useRef(onBump);
  
  // Keep callback ref updated
  useEffect(() => {
    onBumpRef.current = onBump;
  }, [onBump]);

  const requestPermission = useCallback(async () => {
    // iOS 13+ requires permission for DeviceMotionEvent
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        setPermissionGranted(permission === 'granted');
        return permission === 'granted';
      } catch (error) {
        console.error('DeviceMotion permission error:', error);
        setPermissionGranted(false);
        return false;
      }
    }
    // Android and older iOS don't need permission
    setPermissionGranted(true);
    return true;
  }, []);

  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    if (!enabled) return;
    
    const { accelerationIncludingGravity } = event;
    if (!accelerationIncludingGravity) return;

    const { x, y, z } = accelerationIncludingGravity;
    if (x === null || y === null || z === null) return;

    // Calculate total acceleration magnitude
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    // Subtract gravity (approximately 9.8 m/s²) to get actual acceleration
    const actualAcceleration = Math.abs(magnitude - 9.8);
    const now = Date.now();

    // Single strong shake detection
    if (actualAcceleration > threshold) {
      // Check cooldown
      if (now - lastBumpTime > cooldown) {
        setLastBumpTime(now);
        
        // Strong haptic feedback on shake detection
        haptics.impact();
        setTimeout(() => haptics.success(), 80);
        
        onBumpRef.current?.();
      }
    }
  }, [enabled, threshold, cooldown, lastBumpTime]);

  const startListening = useCallback(async () => {
    const hasPermission = await requestPermission();
    if (hasPermission) {
      window.addEventListener('devicemotion', handleMotion);
      setIsListening(true);
    }
  }, [requestPermission, handleMotion]);

  const stopListening = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion);
    setIsListening(false);
  }, [handleMotion]);

  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }

    return () => {
      stopListening();
    };
  }, [enabled, startListening, stopListening]);

  return {
    isListening,
    permissionGranted,
    requestPermission,
    startListening,
    stopListening,
  };
}
