import { useRef, useCallback, ReactNode, useEffect } from 'react';

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
  const divRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x, y, scale, rotation });
  const rafId = useRef(0);

  // Sync props into ref when React re-renders (e.g. after commit)
  useEffect(() => {
    pos.current = { x, y, scale, rotation };
  }, [x, y, scale, rotation]);

  const applyStyle = () => {
    const el = divRef.current;
    if (!el) return;
    const p = pos.current;
    el.style.left = `${p.x}%`;
    el.style.top = `${p.y}%`;
    el.style.transform = `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}deg)`;
  };

  const scheduleApply = () => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(applyStyle);
  };

  const getRect = () => containerRef.current?.getBoundingClientRect();

  const pctToPx = (pctX: number, pctY: number) => {
    const rect = getRect();
    if (!rect) return { px: 0, py: 0 };
    return { px: (pctX / 100) * rect.width, py: (pctY / 100) * rect.height };
  };

  const pxToPct = (px: number, py: number) => {
    const rect = getRect();
    if (!rect) return { pctX: 50, pctY: 50 };
    return { pctX: (px / rect.width) * 100, pctY: (py / rect.height) * 100 };
  };

  const getDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const getAngle = (t1: React.Touch, t2: React.Touch) =>
    Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);

  // ── Touch state ──
  const touchState = useRef<{
    startTouchX: number; startTouchY: number;
    startElX: number; startElY: number;
    startDist: number; startAngle: number;
    startScale: number; startRotation: number;
    fingerCount: number; moved: boolean;
  } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault();
    const rect = getRect(); if (!rect) return;
    const { px: elPx, py: elPy } = pctToPx(pos.current.x, pos.current.y);

    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchState.current = {
        startTouchX: t.clientX - rect.left, startTouchY: t.clientY - rect.top,
        startElX: elPx, startElY: elPy, startDist: 0, startAngle: 0,
        startScale: pos.current.scale, startRotation: pos.current.rotation,
        fingerCount: 1, moved: false,
      };
    } else if (e.touches.length === 2) {
      const dist = getDist(e.touches[0], e.touches[1]);
      const angle = getAngle(e.touches[0], e.touches[1]);
      if (touchState.current) {
        touchState.current.fingerCount = 2;
        touchState.current.startDist = dist;
        touchState.current.startAngle = angle;
        touchState.current.startScale = pos.current.scale;
        touchState.current.startRotation = pos.current.rotation;
      } else {
        touchState.current = {
          startTouchX: 0, startTouchY: 0, startElX: elPx, startElY: elPy,
          startDist: dist, startAngle: angle,
          startScale: pos.current.scale, startRotation: pos.current.rotation,
          fingerCount: 2, moved: false,
        };
      }
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault();
    const ts = touchState.current; if (!ts) return;
    const rect = getRect(); if (!rect) return;
    ts.moved = true;

    if (e.touches.length === 1 && ts.fingerCount === 1) {
      const t = e.touches[0];
      const dx = (t.clientX - rect.left) - ts.startTouchX;
      const dy = (t.clientY - rect.top) - ts.startTouchY;
      const { pctX, pctY } = pxToPct(ts.startElX + dx, ts.startElY + dy);
      pos.current.x = pctX;
      pos.current.y = pctY;
      scheduleApply();
    } else if (e.touches.length === 2) {
      const dist = getDist(e.touches[0], e.touches[1]);
      const angle = getAngle(e.touches[0], e.touches[1]);
      pos.current.scale = Math.max(0.3, Math.min(5, ts.startScale * (dist / ts.startDist)));
      pos.current.rotation = ts.startRotation + (angle - ts.startAngle);
      scheduleApply();
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const ts = touchState.current; if (!ts) return;

    if (!ts.moved && ts.fingerCount === 1 && canRemove) {
      onRemove(id);
      touchState.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const rect = getRect();
      if (rect) {
        const t = e.touches[0];
        const { px: elPx, py: elPy } = pctToPx(pos.current.x, pos.current.y);
        touchState.current = {
          startTouchX: t.clientX - rect.left, startTouchY: t.clientY - rect.top,
          startElX: elPx, startElY: elPy, startDist: 0, startAngle: 0,
          startScale: pos.current.scale, startRotation: pos.current.rotation,
          fingerCount: 1, moved: true,
        };
      }
    } else {
      // Commit final state to React
      onUpdate(id, { ...pos.current });
      touchState.current = null;
    }

    if (e.touches.length === 0) {
      onUpdate(id, { ...pos.current });
      touchState.current = null;
    }
  }, [id, canRemove, onRemove, onUpdate]);

  // ── Pointer (desktop mouse) ──
  const ptrState = useRef<{ startX: number; startY: number; startElX: number; startElY: number; moved: boolean } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation(); e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = getRect(); if (!rect) return;
    const { px: elPx, py: elPy } = pctToPx(pos.current.x, pos.current.y);
    ptrState.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, startElX: elPx, startElY: elPy, moved: false };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !ptrState.current) return;
    e.stopPropagation();
    const rect = getRect(); if (!rect) return;
    ptrState.current.moved = true;
    const dx = (e.clientX - rect.left) - ptrState.current.startX;
    const dy = (e.clientY - rect.top) - ptrState.current.startY;
    const { pctX, pctY } = pxToPct(ptrState.current.startElX + dx, ptrState.current.startElY + dy);
    pos.current.x = pctX;
    pos.current.y = pctY;
    scheduleApply();
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    if (ptrState.current && !ptrState.current.moved && canRemove) {
      onRemove(id);
    } else {
      onUpdate(id, { ...pos.current });
    }
    ptrState.current = null;
  }, [id, canRemove, onRemove, onUpdate]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation(); e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    pos.current.scale = Math.max(0.3, Math.min(5, pos.current.scale + delta));
    scheduleApply();
    onUpdate(id, { scale: pos.current.scale });
  }, [id, onUpdate]);

  const content = imageUrl ? (
    <img src={imageUrl} alt="" className="max-w-[200px] max-h-[200px] object-contain pointer-events-none" draggable={false} />
  ) : children ? children : (
    <span>{text}</span>
  );

  return (
    <div
      ref={divRef}
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
        willChange: 'left, top, transform',
      }}
    >
      {content}
    </div>
  );
}
