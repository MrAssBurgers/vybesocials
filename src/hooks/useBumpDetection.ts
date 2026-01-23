import { useState, useEffect, useCallback, useRef } from 'react';
import { haptics } from '@/lib/haptics';

interface BumpDetectionOptions {
  enabled?: boolean;
  threshold?: number; // Acceleration threshold to detect a bump
  cooldown?: number; // Cooldown period after a bump is detected (ms)
  shakeCount?: number; // Number of shakes required to trigger (like iPhone)
  shakeWindow?: number; // Time window to count shakes (ms)
  onBump?: () => void;
}

export function useBumpDetection({
  enabled = true,
  threshold = 12, // Slightly lower for shake detection
  cooldown = 3000, // 3 seconds cooldown
  shakeCount = 2, // Require 2 shakes like iPhone undo
  shakeWindow = 600, // Within 600ms
  onBump,
}: BumpDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [lastBumpTime, setLastBumpTime] = useState<number>(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const onBumpRef = useRef(onBump);
  
  // Shake detection state
  const shakeTimestamps = useRef<number[]>([]);
  const lastDirection = useRef<'up' | 'down' | null>(null);
  
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

    // Detect direction change for shake detection
    const currentDirection: 'up' | 'down' = y > 0 ? 'up' : 'down';
    const now = Date.now();

    // Check if this qualifies as part of a shake motion
    if (actualAcceleration > threshold) {
      // Direction changed = one "shake"
      if (lastDirection.current !== null && lastDirection.current !== currentDirection) {
        shakeTimestamps.current.push(now);
        
        // Small haptic tick for each shake detected
        haptics.tap();
        
        // Clean old timestamps outside window
        shakeTimestamps.current = shakeTimestamps.current.filter(
          t => now - t < shakeWindow
        );
        
        // Check if we have enough shakes
        if (shakeTimestamps.current.length >= shakeCount) {
          // Check cooldown
          if (now - lastBumpTime > cooldown) {
            setLastBumpTime(now);
            shakeTimestamps.current = []; // Reset
            
            // Strong haptic feedback on successful shake detection
            haptics.impact();
            setTimeout(() => haptics.success(), 100);
            
            onBumpRef.current?.();
          }
        }
      }
      
      lastDirection.current = currentDirection;
    }
  }, [enabled, threshold, cooldown, lastBumpTime, shakeCount, shakeWindow]);

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
