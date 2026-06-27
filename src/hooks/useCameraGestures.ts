import { useCallback, useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { usePinchZoom } from '@/components/camera/CameraZoom';

export interface CameraGestureOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamRef: React.RefObject<MediaStream | null>;
  onClose: () => void;
  onOpenGallery: () => void;
  onOpenMemories?: () => void;
  onFilterSwipe: (direction: -1 | 1) => void;
  onDoubleTapFlip: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function useCameraGestures({
  videoRef,
  streamRef,
  onClose,
  onOpenGallery,
  onOpenMemories,
  onFilterSwipe,
  onDoubleTapFlip,
  disabled = false,
}: CameraGestureOptions) {
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [displayZoom, setDisplayZoom] = useState(1);
  const [showZoom, setShowZoom] = useState(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { handleTouchMove: pinchMove, handleTouchEnd: pinchEnd, resetZoom, applyZoom } =
    usePinchZoom({
      videoRef,
      streamRef,
      onZoomChange: (z) => {
        setDisplayZoom(z);
        setShowZoom(true);
        if (zoomHideTimerRef.current) clearTimeout(zoomHideTimerRef.current);
        zoomHideTimerRef.current = setTimeout(() => setShowZoom(false), 1200);
      },
    });

  const onViewfinderTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      if ((e.target as HTMLElement).closest('button')) return;

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      let locked: 'none' | 'horizontal' | 'vertical' = 'none';

      const handleTouchMove = (moveE: TouchEvent) => {
        if (moveE.touches.length >= 2) {
          pinchMove(moveE);
          return;
        }
        const dx = Math.abs(moveE.touches[0].clientX - startX);
        const dy = Math.abs(moveE.touches[0].clientY - startY);
        if (locked === 'none' && (dx > 10 || dy > 10)) {
          locked = dx > dy ? 'horizontal' : 'vertical';
        }
      };

      const handleTouchEnd = (endE: TouchEvent) => {
        if (endE.touches.length >= 2) {
          pinchEnd();
          document.removeEventListener('touchmove', handleTouchMove);
          document.removeEventListener('touchend', handleTouchEnd);
          return;
        }

        const end = endE.changedTouches[0];
        const diffX = end.clientX - startX;
        const diffY = end.clientY - startY;

        if (locked === 'vertical') {
          if (diffY < -70) {
            triggerHaptic('light');
            onOpenGallery();
          } else if (diffY > 90) {
            triggerHaptic('light');
            onClose();
          }
        } else if (locked === 'horizontal') {
          if (diffX < -70) {
            triggerHaptic('light');
            (onOpenMemories ?? onOpenGallery)();
          } else if (Math.abs(diffX) > 50) {
            onFilterSwipe(diffX > 0 ? -1 : 1);
          }
        }

        pinchEnd();
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    },
    [disabled, onClose, onFilterSwipe, onOpenGallery, onOpenMemories, pinchEnd, pinchMove],
  );

  const onViewfinderClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      if ((e.target as HTMLElement).closest('button')) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setFocusPoint({ x, y });
      triggerHaptic('light');
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => setFocusPoint(null), 900);
    },
    [disabled],
  );

  const onViewfinderDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      resetZoom();
      applyZoom(1);
      setDisplayZoom(1);
      onDoubleTapFlip(e);
    },
    [applyZoom, onDoubleTapFlip, resetZoom],
  );

  return {
    focusPoint,
    displayZoom,
    showZoom,
    onViewfinderTouchStart,
    onViewfinderClick,
    onViewfinderDoubleClick,
  };
}
