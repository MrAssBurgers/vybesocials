import { useRef, useCallback, useEffect, type ReactNode, type RefObject, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

function clampPct(value: number, min = 5, max = 95): number {
  return Math.min(max, Math.max(min, value));
}

function isFingerOverTrash(clientY: number, containerRect: DOMRect): boolean {
  const threshold = containerRect.bottom - containerRect.height * 0.15;
  return clientY > threshold;
}

export type SnapOverlayDragMode = 'bar' | 'free';

interface SnapOverlayDraggableProps {
  id: string;
  x: number;
  y: number;
  mode: SnapOverlayDragMode;
  containerRef: RefObject<HTMLDivElement>;
  onDragEnd: (id: string, x: number, y: number, deleted: boolean) => void;
  onDragStart?: () => void;
  onDragTrashChange?: (over: boolean) => void;
  onDraggingChange?: (id: string | null) => void;
  trashEnabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * 1:1 touch/pointer drag for snap text/sticker overlays.
 * Avoids Framer Motion drag + manual delta (double-move bug on mobile WebViews).
 */
export function SnapOverlayDraggable({
  id,
  x,
  y,
  mode,
  containerRef,
  onDragEnd,
  onDragStart,
  onDragTrashChange,
  onDraggingChange,
  trashEnabled = false,
  className,
  style,
  children,
}: SnapOverlayDraggableProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x, y });
  const dragRef = useRef<{ startFingerX: number; startFingerY: number; startX: number; startY: number } | null>(null);
  const rafRef = useRef(0);
  const overTrashRef = useRef(false);

  const applyPosition = useCallback((nextX: number, nextY: number) => {
    const el = divRef.current;
    if (!el) return;
    if (mode === 'bar') {
      el.style.top = `${nextY}%`;
    } else {
      el.style.left = `${nextX}%`;
      el.style.top = `${nextY}%`;
    }
  }, [mode]);

  useEffect(() => {
    posRef.current = { x, y };
    applyPosition(x, y);
  }, [x, y, applyPosition]);

  const scheduleApply = useCallback((nextX: number, nextY: number) => {
    posRef.current = { x: nextX, y: nextY };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => applyPosition(nextX, nextY));
  }, [applyPosition]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;

    const dyPx = clientY - drag.startFingerY;
    const newY = clampPct(drag.startY + (dyPx / rect.height) * 100);

    if (mode === 'bar') {
      scheduleApply(posRef.current.x, newY);
    } else {
      const dxPx = clientX - drag.startFingerX;
      const newX = clampPct(drag.startX + (dxPx / rect.width) * 100);
      scheduleApply(newX, newY);
    }

    if (trashEnabled && onDragTrashChange) {
      const over = isFingerOverTrash(clientY, rect);
      if (over !== overTrashRef.current) {
        overTrashRef.current = over;
        onDragTrashChange(over);
      }
    }
  }, [containerRef, mode, onDragTrashChange, scheduleApply, trashEnabled]);

  const finishDrag = useCallback(() => {
    if (!dragRef.current) return;
    const { x: finalX, y: finalY } = posRef.current;
    onDragEnd(id, finalX, finalY, trashEnabled && overTrashRef.current);
    dragRef.current = null;
    overTrashRef.current = false;
    onDraggingChange?.(null);
  }, [id, onDragEnd, onDraggingChange, trashEnabled]);

  const beginDrag = useCallback((clientX: number, clientY: number) => {
    onDragStart?.();
    onDraggingChange?.(id);
    dragRef.current = {
      startFingerX: clientX,
      startFingerY: clientY,
      startX: posRef.current.x,
      startY: posRef.current.y,
    };
  }, [id, onDragStart, onDraggingChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    beginDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, [beginDrag]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [handleMove]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    finishDrag();
  }, [finishDrag]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag(e.clientX, e.clientY);
  }, [beginDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !dragRef.current) return;
    e.stopPropagation();
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.stopPropagation();
    finishDrag();
  }, [finishDrag]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const baseStyle: CSSProperties =
    mode === 'bar'
      ? {
          top: `${y}%`,
          transform: 'translateY(-50%)',
          touchAction: 'none',
          ...style,
        }
      : {
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
          ...style,
        };

  return (
    <div
      ref={divRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        mode === 'bar'
          ? 'absolute left-0 right-0 cursor-move select-none flex items-center justify-center active:scale-[1.01] transition-transform'
          : 'absolute touch-none select-none cursor-grab active:cursor-grabbing',
        className,
      )}
      style={baseStyle}
    >
      {children}
    </div>
  );
}
