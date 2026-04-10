import { useRef, useCallback } from 'react';

interface DraggableOverlayProps {
  id: string;
  text: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  color: string;
  fontSize: number;
  scale: number;
  rotation: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onUpdate: (id: string, updates: { x?: number; y?: number; scale?: number; rotation?: number }) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

export function DraggableOverlay({
  id, text, x, y, color, fontSize, scale, rotation,
  containerRef, onUpdate, onRemove, canRemove,
}: DraggableOverlayProps) {
  const touchState = useRef<{
    // Single finger drag
    startTouchX: number;
    startTouchY: number;
    startElX: number; // px
    startElY: number; // px
    // Two finger pinch+rotate
    startDist: number;
    startAngle: number;
    startScale: number;
    startRotation: number;
    fingerCount: number;
    moved: boolean;
  } | null>(null);

  const currentPos = useRef({ x, y, scale, rotation });
  currentPos.current = { x, y, scale, rotation };

  const getRect = () => containerRef.current?.getBoundingClientRect();

  const pctToPx = useCallback((pctX: number, pctY: number) => {
    const rect = getRect();
    if (!rect) return { px: 0, py: 0 };
    return { px: (pctX / 100) * rect.width, py: (pctY / 100) * rect.height };
  }, [containerRef]);

  const pxToPct = useCallback((px: number, py: number) => {
    const rect = getRect();
    if (!rect) return { pctX: 50, pctY: 50 };
    return { pctX: (px / rect.width) * 100, pctY: (py / rect.height) * 100 };
  }, [containerRef]);

  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const getAngle = (t1: React.Touch, t2: React.Touch) =>
    Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = getRect();
    if (!rect) return;

    const { px: elPx, py: elPy } = pctToPx(currentPos.current.x, currentPos.current.y);

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchState.current = {
        startTouchX: touch.clientX - rect.left,
        startTouchY: touch.clientY - rect.top,
        startElX: elPx,
        startElY: elPy,
        startDist: 0,
        startAngle: 0,
        startScale: currentPos.current.scale,
        startRotation: currentPos.current.rotation,
        fingerCount: 1,
        moved: false,
      };
    } else if (e.touches.length === 2) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      const angle = getAngle(e.touches[0], e.touches[1]);
      if (touchState.current) {
        touchState.current.fingerCount = 2;
        touchState.current.startDist = dist;
        touchState.current.startAngle = angle;
        touchState.current.startScale = currentPos.current.scale;
        touchState.current.startRotation = currentPos.current.rotation;
      } else {
        touchState.current = {
          startTouchX: 0,
          startTouchY: 0,
          startElX: elPx,
          startElY: elPy,
          startDist: dist,
          startAngle: angle,
          startScale: currentPos.current.scale,
          startRotation: currentPos.current.rotation,
          fingerCount: 2,
          moved: false,
        };
      }
    }
  }, [pctToPx]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!touchState.current) return;
    const rect = getRect();
    if (!rect) return;

    touchState.current.moved = true;

    if (e.touches.length === 1 && touchState.current.fingerCount === 1) {
      const touch = e.touches[0];
      const currentTouchX = touch.clientX - rect.left;
      const currentTouchY = touch.clientY - rect.top;

      const deltaX = currentTouchX - touchState.current.startTouchX;
      const deltaY = currentTouchY - touchState.current.startTouchY;

      const newPx = touchState.current.startElX + deltaX;
      const newPy = touchState.current.startElY + deltaY;

      const { pctX, pctY } = pxToPct(newPx, newPy);
      onUpdate(id, { x: pctX, y: pctY });
    } else if (e.touches.length === 2) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      const angle = getAngle(e.touches[0], e.touches[1]);

      const newScale = touchState.current.startScale * (dist / touchState.current.startDist);
      const newRotation = touchState.current.startRotation + (angle - touchState.current.startAngle);

      onUpdate(id, {
        scale: Math.max(0.3, Math.min(5, newScale)),
        rotation: newRotation,
      });
    }
  }, [id, onUpdate, pxToPct]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();

    if (!touchState.current) return;

    // Tap to remove (no movement, single finger)
    if (!touchState.current.moved && touchState.current.fingerCount === 1 && canRemove) {
      onRemove(id);
    }

    // If going from 2 fingers to 1, reset single-finger tracking
    if (e.touches.length === 1) {
      const rect = getRect();
      if (rect) {
        const touch = e.touches[0];
        const { px: elPx, py: elPy } = pctToPx(currentPos.current.x, currentPos.current.y);
        touchState.current = {
          startTouchX: touch.clientX - rect.left,
          startTouchY: touch.clientY - rect.top,
          startElX: elPx,
          startElY: elPy,
          startDist: 0,
          startAngle: 0,
          startScale: currentPos.current.scale,
          startRotation: currentPos.current.rotation,
          fingerCount: 1,
          moved: true, // already interacted
        };
      }
    } else {
      touchState.current = null;
    }
  }, [id, onRemove, canRemove, pctToPx]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="absolute cursor-move select-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        color,
        fontSize,
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {text}
    </div>
  );
}
