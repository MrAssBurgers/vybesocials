import { useRef, useCallback, useEffect, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface SwipeState {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  swiping: boolean;
  direction: 'left' | 'right' | 'up' | 'down' | null;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export function useSwipeGesture(handlers: SwipeHandlers, threshold = SWIPE_THRESHOLD) {
  const [state, setState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    swiping: false,
    direction: null,
  });

  const startTime = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startTime.current = Date.now();
    setState({
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      swiping: true,
      direction: null,
    });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!state.swiping) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;

    let direction: 'left' | 'right' | 'up' | 'down' | null = null;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    setState(prev => ({
      ...prev,
      deltaX,
      deltaY,
      direction,
    }));
  }, [state.swiping, state.startX, state.startY]);

  const handleTouchEnd = useCallback(() => {
    if (!state.swiping) return;

    const duration = Date.now() - startTime.current;
    const velocity = Math.sqrt(state.deltaX ** 2 + state.deltaY ** 2) / duration;

    const shouldTrigger = 
      Math.abs(state.deltaX) > threshold || 
      Math.abs(state.deltaY) > threshold ||
      velocity > SWIPE_VELOCITY_THRESHOLD;

    if (shouldTrigger && state.direction) {
      triggerHaptic('light');
      
      switch (state.direction) {
        case 'left':
          handlers.onSwipeLeft?.();
          break;
        case 'right':
          handlers.onSwipeRight?.();
          break;
        case 'up':
          handlers.onSwipeUp?.();
          break;
        case 'down':
          handlers.onSwipeDown?.();
          break;
      }
    }

    setState({
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
      swiping: false,
      direction: null,
    });
  }, [state, threshold, handlers]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    state,
  };
}

interface LongPressOptions {
  onLongPress: () => void;
  onPress?: () => void;
  duration?: number;
}

export function useLongPress({ onLongPress, onPress, duration = 500 }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isLongPress = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isLongPress.current = false;
    
    if ('touches' in e) {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      startPos.current = { x: e.clientX, y: e.clientY };
    }

    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      triggerHaptic('medium');
      onLongPress();
    }, duration);
  }, [onLongPress, duration]);

  const move = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    let currentPos: { x: number; y: number };
    
    if ('touches' in e) {
      currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      currentPos = { x: e.clientX, y: e.clientY };
    }

    // Cancel if moved too far
    const distance = Math.sqrt(
      (currentPos.x - startPos.current.x) ** 2 + 
      (currentPos.y - startPos.current.y) ** 2
    );

    if (distance > 10) {
      clearTimeout(timerRef.current);
    }
  }, []);

  const end = useCallback(() => {
    clearTimeout(timerRef.current);
    if (!isLongPress.current) {
      onPress?.();
    }
  }, [onPress]);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: cancel,
  };
}

interface PinchState {
  scale: number;
  initialDistance: number;
  isPinching: boolean;
}

export function usePinchGesture(onPinch?: (scale: number) => void) {
  const [state, setState] = useState<PinchState>({
    scale: 1,
    initialDistance: 0,
    isPinching: false,
  });

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = getDistance(e.touches);
      setState({
        scale: 1,
        initialDistance: distance,
        isPinching: true,
      });
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && state.isPinching) {
      const distance = getDistance(e.touches);
      const scale = distance / state.initialDistance;
      setState(prev => ({ ...prev, scale }));
      onPinch?.(scale);
    }
  }, [state.isPinching, state.initialDistance, onPinch]);

  const handleTouchEnd = useCallback(() => {
    setState(prev => ({ ...prev, isPinching: false }));
  }, []);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    scale: state.scale,
    isPinching: state.isPinching,
  };
}

// Double tap detection
export function useDoubleTap(onDoubleTap: () => void, delay = 300) {
  const lastTap = useRef(0);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < delay) {
      triggerHaptic('light');
      onDoubleTap();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [onDoubleTap, delay]);

  return handleTap;
}
