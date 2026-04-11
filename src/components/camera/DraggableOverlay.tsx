import { useRef, useCallback, ReactNode } from 'react';

interface DraggableOverlayProps {
  id: string;
  text?: string;
  imageUrl?: string;
  children?: ReactNode;
  x: number;
  y: number;
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
  id, text, imageUrl, children, x, y, color, fontSize, scale, rotation,
  containerRef, onUpdate, onRemove, canRemove,
}: DraggableOverlayProps) {
  const touchState = useRef<{
    startTouchX: number;
    startTouchY: number;
    startElX: number;
    startElY: number;
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

  // ── Touch handlers (mobile pinch/rotate) ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = getRect();
    if (!rect) return;
    const { px: elPx, py: elPy } = pctToPx(currentPos.current.x, currentPos.current.y);

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchState.current = {
        startTouchX: touch.clientX - rect.left, startTouchY: touch.clientY - rect.top,
        startElX: elPx, startElY: elPy, startDist: 0, startAngle: 0,
        startScale: currentPos.current.scale, startRotation: currentPos.current.rotation,
        fingerCount: 1, moved: false,
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
          startTouchX: 0, startTouchY: 0, startElX: elPx, startElY: elPy,
          startDist: dist, startAngle: angle,
          startScale: currentPos.current.scale, startRotation: currentPos.current.rotation,
          fingerCount: 2, moved: false,
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
      const deltaX = (touch.clientX - rect.left) - touchState.current.startTouchX;
      const deltaY = (touch.clientY - rect.top) - touchState.current.startTouchY;
      const { pctX, pctY } = pxToPct(touchState.current.startElX + deltaX, touchState.current.startElY + deltaY);
      onUpdate(id, { x: pctX, y: pctY });
    } else if (e.touches.length === 2) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      const angle = getAngle(e.touches[0], e.touches[1]);
      onUpdate(id, {
        scale: Math.max(0.3, Math.min(5, touchState.current.startScale * (dist / touchState.current.startDist))),
        rotation: touchState.current.startRotation + (angle - touchState.current.startAngle),
      });
    }
  }, [id, onUpdate, pxToPct]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchState.current) return;
    if (!touchState.current.moved && touchState.current.fingerCount === 1 && canRemove) {
      onRemove(id);
    }
    if (e.touches.length === 1) {
      const rect = getRect();
      if (rect) {
        const touch = e.touches[0];
        const { px: elPx, py: elPy } = pctToPx(currentPos.current.x, currentPos.current.y);
        touchState.current = {
          startTouchX: touch.clientX - rect.left, startTouchY: touch.clientY - rect.top,
          startElX: elPx, startElY: elPy, startDist: 0, startAngle: 0,
          startScale: currentPos.current.scale, startRotation: currentPos.current.rotation,
          fingerCount: 1, moved: true,
        };
      }
    } else {
      touchState.current = null;
    }
  }, [id, onRemove, canRemove, pctToPx]);

  // ── Pointer handlers (desktop mouse drag + scroll-to-scale) ──
  const pointerState = useRef<{ startX: number; startY: number; startElX: number; startElY: number; moved: boolean } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // let touch handlers deal with it
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = getRect();
    if (!rect) return;
    const { px: elPx, py: elPy } = pctToPx(currentPos.current.x, currentPos.current.y);
    pointerState.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, startElX: elPx, startElY: elPy, moved: false };
  }, [pctToPx]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !pointerState.current) return;
    e.stopPropagation();
    const rect = getRect();
    if (!rect) return;
    pointerState.current.moved = true;
    const deltaX = (e.clientX - rect.left) - pointerState.current.startX;
    const deltaY = (e.clientY - rect.top) - pointerState.current.startY;
    const { pctX, pctY } = pxToPct(pointerState.current.startElX + deltaX, pointerState.current.startElY + deltaY);
    onUpdate(id, { x: pctX, y: pctY });
  }, [id, onUpdate, pxToPct]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    if (pointerState.current && !pointerState.current.moved && canRemove) {
      onRemove(id);
    }
    pointerState.current = null;
  }, [id, canRemove, onRemove]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    onUpdate(id, { scale: Math.max(0.3, Math.min(5, currentPos.current.scale + delta)) });
  }, [id, onUpdate]);

  const content = imageUrl ? (
    <img src={imageUrl} alt="" className="max-w-[200px] max-h-[200px] object-contain pointer-events-none" draggable={false} />
  ) : children ? children : (
    <span>{text}</span>
  );

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      className="absolute cursor-move select-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        color,
        fontSize: imageUrl ? undefined : fontSize,
        textShadow: imageUrl ? undefined : '2px 2px 4px rgba(0,0,0,0.5)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {content}
    </div>
  );
}
