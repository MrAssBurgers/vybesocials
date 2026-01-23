import { useState, useEffect, useCallback, useRef } from 'react';
import { haptics } from '@/lib/haptics';

interface SwingDetectionOptions {
  enabled?: boolean;
  threshold?: number; // Acceleration threshold for swing detection
  swingWindow?: number; // Time window for detecting back-then-forward motion (ms)
  cooldown?: number; // Cooldown period after a swing is detected (ms)
  onSwing?: () => void;
}

interface MotionState {
  direction: 'neutral' | 'back' | 'forward';
  timestamp: number;
  magnitude: number;
}

export function useSwingDetection({
  enabled = true,
  threshold = 8, // Lower threshold for smoother detection
  swingWindow = 600, // 600ms window to complete back-forward swing
  cooldown = 2000, // 2 seconds cooldown
  onSwing,
}: SwingDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [lastSwingTime, setLastSwingTime] = useState<number>(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  
  const onSwingRef = useRef(onSwing);
  const motionStateRef = useRef<MotionState>({ direction: 'neutral', timestamp: 0, magnitude: 0 });
  const backDetectedRef = useRef<{ timestamp: number; magnitude: number } | null>(null);
  
  // Keep callback ref updated
  useEffect(() => {
    onSwingRef.current = onSwing;
  }, [onSwing]);

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
    
    const { acceleration } = event;
    if (!acceleration) return;

    const { z } = acceleration; // Z-axis is the forward/back motion when holding phone normally
    if (z === null) return;

    const now = Date.now();
    
    // Check cooldown
    if (now - lastSwingTime < cooldown) return;

    // Detect back motion (negative Z acceleration = moving phone toward you)
    if (z < -threshold) {
      const magnitude = Math.abs(z);
      
      // If we haven't detected a back motion yet, or this is stronger
      if (!backDetectedRef.current || magnitude > backDetectedRef.current.magnitude) {
        backDetectedRef.current = { timestamp: now, magnitude };
        motionStateRef.current = { direction: 'back', timestamp: now, magnitude };
      }
    }
    
    // Detect forward motion (positive Z acceleration = moving phone away from you)
    if (z > threshold && backDetectedRef.current) {
      const timeSinceBack = now - backDetectedRef.current.timestamp;
      
      // Check if the forward motion is within the swing window
      if (timeSinceBack > 50 && timeSinceBack < swingWindow) {
        // Valid swing detected!
        setLastSwingTime(now);
        backDetectedRef.current = null;
        motionStateRef.current = { direction: 'neutral', timestamp: now, magnitude: 0 };
        
        // Haptic feedback
        haptics.impact();
        setTimeout(() => haptics.success(), 80);
        
        onSwingRef.current?.();
      }
    }
    
    // Reset back detection if too much time has passed
    if (backDetectedRef.current && now - backDetectedRef.current.timestamp > swingWindow) {
      backDetectedRef.current = null;
      motionStateRef.current = { direction: 'neutral', timestamp: now, magnitude: 0 };
    }
  }, [enabled, threshold, swingWindow, cooldown, lastSwingTime]);

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
    backDetectedRef.current = null;
    motionStateRef.current = { direction: 'neutral', timestamp: 0, magnitude: 0 };
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
