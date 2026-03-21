import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { X, Eye, Check, Smartphone, Monitor, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState } from '@/hooks/useGridLayout';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';

/* ── Types ── */
interface DragState {
  isDragging: boolean;
  dragId: string | null;
  ghostX: number;
  ghostY: number;
  offsetX: number;
  offsetY: number;
  ghostWidth: number;
  ghostHeight: number;
}

interface ResizeDragState {
  isResizing: boolean;
  widgetId: string | null;
  direction: 'right' | 'bottom' | 'corner';
  previewCol: 1 | 2;
  previewRow: 1 | 2;
  overlayRect: { x: number; y: number; w: number; h: number } | null;
}

interface EditModeCtx {
  isEditing: boolean;
  localWidgets: GridWidgetState[];
  selectedWidget: string | null;
  setSelectedWidget: (id: string | null) => void;
  handleToggle: (id: string) => void;
  handleResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
  orderedEnabledIds: string[];
  handleReorder: (draggedId: string, targetIndex: number) => void;
  dragState: DragState;
  resizeState: ResizeDragState;
  startDrag: (id: string, e: React.PointerEvent) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

const defaultDrag: DragState = {
  isDragging: false, dragId: null, ghostX: 0, ghostY: 0,
  offsetX: 0, offsetY: 0, ghostWidth: 0, ghostHeight: 0,
};

const defaultResize: ResizeDragState = {
  isResizing: false, widgetId: null, direction: 'corner',
  previewCol: 1, previewRow: 1, overlayRect: null,
};

const EditModeContext = createContext<EditModeCtx>({
  isEditing: false, localWidgets: [], selectedWidget: null,
  setSelectedWidget: () => {}, handleToggle: () => {},
  handleResize: () => {}, orderedEnabledIds: [],
  handleReorder: () => {}, dragState: defaultDrag,
  resizeState: defaultResize, startDrag: () => {},
  gridRef: { current: null },
});

export const useEditMode = () => useContext(EditModeContext);

/* ── Jiggle CSS ── */
const jiggleCSS = `
@keyframes widget-jiggle {
  0%   { transform: rotate(-0.5deg); }
  50%  { transform: rotate(0.5deg); }
  100% { transform: rotate(-0.5deg); }
}
.widget-jiggle { animation: widget-jiggle 0.25s ease-in-out infinite; }
.widget-placeholder {
  opacity: 0.3;
  border: 2px dashed hsl(var(--primary) / 0.5);
  border-radius: 16px;
  animation: none !important;
}
`;

const layoutSpring = { type: 'spring' as const, damping: 28, stiffness: 350, mass: 0.6 };

/* ── Grid measurement helper ── */
function measureGrid(gridEl: HTMLElement | null) {
  if (!gridEl) return { colWidth: 0, rowHeight: 56, gap: 12 };
  const style = getComputedStyle(gridEl);
  const gap = parseFloat(style.gap) || 12;
  const cols = style.gridTemplateColumns.split(' ');
  const colWidth = cols.length > 0 ? parseFloat(cols[0]) : gridEl.clientWidth / 2;
  // Measure actual row height from first widget
  const firstChild = gridEl.querySelector('[data-widget-id]') as HTMLElement | null;
  const rowHeight = firstChild ? firstChild.getBoundingClientRect().height : 80;
  return { colWidth, rowHeight, gap };
}

/* ── Resize handle component ── */
function ResizeHandle({
  widgetId, direction, widget, onResizeStart,
}: {
  widgetId: string;
  direction: 'right' | 'bottom' | 'corner';
  widget: GridWidgetState;
  onResizeStart: (id: string, dir: 'right' | 'bottom' | 'corner', e: React.PointerEvent) => void;
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart(widgetId, direction, e);
  };

  const base = "absolute z-40";

  if (direction === 'right') {
    return (
      <div
        data-resize-handle
        onPointerDown={onPointerDown}
        style={{ touchAction: 'none' }}
        className={cn(base, "top-1/2 -right-3 -translate-y-1/2 w-6 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center cursor-ew-resize")}
      >
        <div className="w-[2px] h-5 rounded-full bg-primary-foreground/80" />
      </div>
    );
  }

  if (direction === 'bottom') {
    return (
      <div
        data-resize-handle
        onPointerDown={onPointerDown}
        style={{ touchAction: 'none' }}
        className={cn(base, "-bottom-3 left-1/2 -translate-x-1/2 h-6 w-12 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center cursor-ns-resize")}
      >
        <div className="h-[2px] w-5 rounded-full bg-primary-foreground/80" />
      </div>
    );
  }

  return (
    <div
      data-resize-handle
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none' }}
      className={cn(base, "-bottom-3 -right-3 w-7 h-7 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center cursor-nwse-resize border-2 border-background")}
    >
      <Maximize2 className="h-2.5 w-2.5 text-primary-foreground/80 rotate-90" />
    </div>
  );
}

/* ── Editable widget wrapper ── */
export function EditableWidgetWrapper({
  widgetId, children, className,
}: {
  widgetId: string; children: ReactNode; className?: string;
}) {
  const {
    isEditing, localWidgets, selectedWidget, setSelectedWidget,
    handleToggle, dragState, startDrag, resizeState,
  } = useEditMode();
  const widget = localWidgets.find(w => w.id === widgetId);
  const didDragRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  if (!isEditing || !widget) return <>{children}</>;

  const isSelected = selectedWidget === widgetId;
  const isBeingDragged = dragState.dragId === widgetId;
  const isBeingResized = resizeState.widgetId === widgetId && resizeState.isResizing;

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-resize-handle]') || target.closest('[data-widget-control]')) return;

    didDragRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    const savedEvent = { ...e, clientX: e.clientX, clientY: e.clientY, preventDefault: () => {} } as React.PointerEvent;

    const onMoveCheck = (ev: PointerEvent) => {
      const dx = ev.clientX - startPosRef.current.x;
      const dy = ev.clientY - startPosRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        didDragRef.current = true;
        cleanup();
        startDrag(widgetId, savedEvent);
      }
    };

    const onUpCheck = () => {
      cleanup();
      if (!didDragRef.current) {
        setSelectedWidget(isSelected ? null : widgetId);
        triggerHaptic('light');
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMoveCheck);
      window.removeEventListener('pointerup', onUpCheck);
      window.removeEventListener('pointercancel', onUpCheck);
    };

    window.addEventListener('pointermove', onMoveCheck);
    window.addEventListener('pointerup', onUpCheck);
    window.addEventListener('pointercancel', onUpCheck);
  };

  return (
    <motion.div
      layout
      layoutId={`widget-${widgetId}`}
      transition={layoutSpring}
      data-widget-id={widgetId}
      onPointerDown={onPointerDown}
      className={cn(
        'relative select-none cursor-grab active:cursor-grabbing',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
        isBeingDragged && 'widget-placeholder',
        !isBeingDragged && !isBeingResized && 'widget-jiggle',
        className,
      )}
      style={{
        animationDelay: `${(widget.order % 5) * 0.05}s`,
        zIndex: isSelected ? 20 : isBeingDragged ? 0 : 1,
        touchAction: 'none',
      }}
    >
      {/* Content card */}
      <motion.div
        layout
        transition={layoutSpring}
        className={cn(
          'relative rounded-2xl overflow-hidden h-full transition-shadow duration-200',
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20'
            : 'ring-1 ring-border/30',
          !widget.enabled && 'opacity-30 grayscale',
        )}
        style={{ pointerEvents: 'none' }}
      >
        {children}
      </motion.div>

      {/* Toggle button */}
      <motion.button
        data-widget-control
        whileTap={{ scale: 0.85 }}
        onClick={e => { e.stopPropagation(); triggerHaptic('medium'); handleToggle(widgetId); }}
        className={cn(
          'absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg z-40',
          widget.enabled ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
        )}
      >
        {widget.enabled ? <X className="h-3 w-3" strokeWidth={3} /> : <Eye className="h-3 w-3" strokeWidth={3} />}
      </motion.button>

      {/* Size badge */}
      <div className="absolute -top-1.5 -right-1.5 z-40">
        <span className="text-[8px] font-bold bg-card/90 backdrop-blur border border-border/40 rounded-md px-1.5 py-0.5 shadow-sm text-muted-foreground">
          {widget.colSpan}×{widget.rowSpan}
        </span>
      </div>

      {/* Resize handles */}
      <AnimatePresence>
        {isSelected && widget.enabled && (
          <ResizeHandles widgetId={widgetId} widget={widget} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Extracted resize handles group ── */
function ResizeHandles({ widgetId, widget }: { widgetId: string; widget: GridWidgetState }) {
  const { handleResizeStart } = useResizeContext();
  return (
    <>
      {(['right', 'bottom', 'corner'] as const).map((dir, i) => (
        <motion.div
          key={dir}
          data-resize-handle
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.12, delay: i * 0.02 }}
        >
          <ResizeHandle widgetId={widgetId} direction={dir} widget={widget} onResizeStart={handleResizeStart} />
        </motion.div>
      ))}
    </>
  );
}

// Tiny context to pass resize start handler without prop drilling
const ResizeCtx = createContext<{ handleResizeStart: (id: string, dir: 'right' | 'bottom' | 'corner', e: React.PointerEvent) => void }>({
  handleResizeStart: () => {},
});
const useResizeContext = () => useContext(ResizeCtx);

/* ── Edit grid wrapper ── */
export function EditableWidgetList({ children }: { children: ReactNode }) {
  const { isEditing, gridRef } = useEditMode();
  if (!isEditing) return <>{children}</>;
  return (
    <LayoutGroup>
      <div ref={gridRef} className="grid grid-cols-2 gap-3 px-3" style={{ gridAutoRows: 'minmax(56px, auto)' }}>
        {children}
      </div>
    </LayoutGroup>
  );
}

/* ── Non-edit grid wrapper ── */
export function WidgetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-3" style={{ gridAutoRows: 'minmax(56px, auto)' }}>
      {children}
    </div>
  );
}

/* ── Drag Ghost (portal-based, renders actual widget clone) ── */
function DragGhost({ dragState, dragCloneRef }: { dragState: DragState; dragCloneRef: React.RefObject<HTMLElement | null> }) {
  if (!dragState.isDragging || !dragCloneRef.current) return null;

  return createPortal(
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        left: dragState.ghostX - dragState.offsetX,
        top: dragState.ghostY - dragState.offsetY,
        width: dragState.ghostWidth,
        height: dragState.ghostHeight,
        transition: 'transform 0.08s ease-out',
        transform: 'scale(1.05)',
        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.25))',
        borderRadius: 16,
        overflow: 'hidden',
      }}
      dangerouslySetInnerHTML={{ __html: dragCloneRef.current.innerHTML }}
    />,
    document.body,
  );
}

/* ── Resize Preview Overlay ── */
function ResizeOverlay({ resizeState }: { resizeState: ResizeDragState }) {
  if (!resizeState.isResizing || !resizeState.overlayRect) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed z-[150] pointer-events-none rounded-2xl border-2 border-primary/60"
      style={{
        left: resizeState.overlayRect.x,
        top: resizeState.overlayRect.y,
        width: resizeState.overlayRect.w,
        height: resizeState.overlayRect.h,
        background: 'hsl(var(--primary) / 0.12)',
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-primary bg-background/80 rounded-md px-2 py-0.5">
          {resizeState.previewCol}×{resizeState.previewRow}
        </span>
      </div>
    </motion.div>,
    document.body,
  );
}

/* ── Floating toolbar ── */
function EditToolbar({
  saving, variant, onSave, onCancel,
}: {
  saving: boolean; variant: string; onSave: () => void; onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-0 left-0 right-0 z-[100] px-3 pt-[max(env(safe-area-inset-top),8px)] pb-2 bg-card/95 backdrop-blur-xl border-b border-primary/30 shadow-xl shadow-primary/10"
    >
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-sm font-medium text-muted-foreground">
          Cancel
        </Button>
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg px-1 py-0.5">
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1',
            variant === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
          )}>
            <Smartphone className="h-2.5 w-2.5" /> Mobile
          </span>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1',
            variant === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
          )}>
            <Monitor className="h-2.5 w-2.5" /> Desktop
          </span>
        </div>
        <Button size="sm" onClick={onSave} disabled={saving} className="gradient-animated text-white text-sm font-semibold gap-1.5">
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Done'}
        </Button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        Tap to select · Drag to move · Drag handles to resize
      </p>
    </motion.div>
  );
}

/* ── Provider ── */
export function HomeEditModeProvider({
  editing, onEditingChange, children,
}: {
  editing: boolean; onEditingChange: (v: boolean) => void; children: ReactNode;
}) {
  const { config, variant, saveGridLayout } = useGridLayout();
  const [localWidgets, setLocalWidgets] = useState<GridWidgetState[]>(config.widgets);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragState, setDragState] = useState<DragState>(defaultDrag);
  const [resizeState, setResizeState] = useState<ResizeDragState>(defaultResize);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragCloneRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number>(0);
  const swapTimerRef = useRef<number>(0);
  const lastHoverRef = useRef<string | null>(null);

  useEffect(() => {
    if (editing) {
      setLocalWidgets(config.widgets);
      setSelectedWidget(null);
      navVisibility.setInEditMode(true);
    } else {
      navVisibility.setInEditMode(false);
    }
    return () => navVisibility.setInEditMode(false);
  }, [editing, config.widgets]);

  const orderedEnabledIds = localWidgets
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)
    .map(w => w.id);

  const handleToggle = useCallback((id: string) => {
    setLocalWidgets(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  }, []);

  const handleResize = useCallback((id: string, col: 1 | 2, row: 1 | 2) => {
    setLocalWidgets(prev => prev.map(w => w.id === id ? { ...w, colSpan: col, rowSpan: row } : w));
  }, []);

  // Apple-style insertion reorder: remove dragged item, insert at target index
  const handleReorder = useCallback((draggedId: string, targetIndex: number) => {
    setLocalWidgets(prev => {
      const enabled = prev.filter(w => w.enabled).sort((a, b) => a.order - b.order);
      const disabled = prev.filter(w => !w.enabled);
      const dragIdx = enabled.findIndex(w => w.id === draggedId);
      if (dragIdx === -1 || targetIndex === dragIdx) return prev;

      // Remove from old position, insert at new position
      const item = enabled[dragIdx];
      const without = [...enabled];
      without.splice(dragIdx, 1);
      const clampedTarget = Math.max(0, Math.min(without.length, targetIndex));
      without.splice(clampedTarget, 0, item);

      // Reassign sequential orders
      const reordered = without.map((w, i) => ({ ...w, order: i }));
      return [...reordered, ...disabled];
    });
    triggerHaptic('light');
  }, []);

  // Store original widget order at drag start for snap-back
  const dragOriginalRef = useRef<GridWidgetState[] | null>(null);

  // Keep a ref of localWidgets for the drag closure to avoid stale reads
  const localWidgetsRef = useRef(localWidgets);
  useEffect(() => { localWidgetsRef.current = localWidgets; }, [localWidgets]);

  /* ── DRAG ENGINE: Apple-style insertion reorder ── */
  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    triggerHaptic('medium');

    const el = document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragCloneRef.current = el;

    // Snapshot current order for snap-back
    dragOriginalRef.current = [...localWidgetsRef.current];

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragState({
      isDragging: true,
      dragId: id,
      ghostX: e.clientX,
      ghostY: e.clientY,
      offsetX,
      offsetY,
      ghostWidth: rect.width,
      ghostHeight: rect.height,
    });
    setSelectedWidget(null);
    lastHoverRef.current = null;

    let lastInsertIndex = -1;

    const onMove = (ev: PointerEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDragState(prev => ({ ...prev, ghostX: ev.clientX, ghostY: ev.clientY }));

        // Get enabled widgets in order (excluding dragged) from the CURRENT state
        const currentWidgets = localWidgetsRef.current;
        const enabled = currentWidgets
          .filter(w => w.enabled)
          .sort((a, b) => a.order - b.order);
        const enabledWithoutDrag = enabled.filter(w => w.id !== id);

        // Collect rects of non-dragged widgets in their current DOM positions
        const entries: { id: string; rect: DOMRect; idx: number }[] = [];
        enabledWithoutDrag.forEach((w, idx) => {
          const node = document.querySelector(`[data-widget-id="${w.id}"]`) as HTMLElement | null;
          if (node) {
            entries.push({ id: w.id, rect: node.getBoundingClientRect(), idx });
          }
        });

        if (entries.length === 0) return;

        // Use the ghost center point for more accurate hit testing
        const ghostCenterX = ev.clientX - offsetX + rect.width / 2;
        const ghostCenterY = ev.clientY - offsetY + rect.height / 2;

        // Find insertion index: where the ghost center falls relative to other widgets
        let insertIndex = entries.length; // default: end
        for (let i = 0; i < entries.length; i++) {
          const r = entries[i].rect;
          const cy = (r.top + r.bottom) / 2;
          const cx = (r.left + r.right) / 2;

          if (ghostCenterY < cy) {
            insertIndex = i;
            break;
          }
          // Same row: check horizontal position
          if (Math.abs(ghostCenterY - cy) < r.height * 0.4 && ghostCenterX < cx) {
            insertIndex = i;
            break;
          }
        }

        if (insertIndex !== lastInsertIndex) {
          lastInsertIndex = insertIndex;
          clearTimeout(swapTimerRef.current);
          swapTimerRef.current = window.setTimeout(() => {
            // Reorder: remove dragged from enabled list, insert at new position
            setLocalWidgets(prev => {
              const en = prev.filter(w => w.enabled).sort((a, b) => a.order - b.order);
              const dis = prev.filter(w => !w.enabled);
              const dragIdx = en.findIndex(w => w.id === id);
              if (dragIdx === -1) return prev;

              const without = [...en];
              const [item] = without.splice(dragIdx, 1);
              const clamped = Math.max(0, Math.min(without.length, insertIndex));
              without.splice(clamped, 0, item);

              return [...without.map((w, i) => ({ ...w, order: i })), ...dis];
            });
            triggerHaptic('light');
          }, 60);
        }
      });
    };

    const onUp = () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(swapTimerRef.current);
      lastHoverRef.current = null;
      lastInsertIndex = -1;
      dragOriginalRef.current = null;
      setDragState(defaultDrag);
      dragCloneRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [handleReorder]);

  /* ── RESIZE ENGINE: grid-snapped preview overlay ── */
  const handleResizeStart = useCallback((id: string, direction: 'right' | 'bottom' | 'corner', e: React.PointerEvent) => {
    e.preventDefault();
    triggerHaptic('light');

    const widget = localWidgets.find(w => w.id === id);
    if (!widget) return;

    const el = document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement | null;
    if (!el) return;

    const originRect = el.getBoundingClientRect();
    const { colWidth, rowHeight, gap } = measureGrid(gridRef.current);

    setResizeState({
      isResizing: true,
      widgetId: id,
      direction,
      previewCol: widget.colSpan,
      previewRow: widget.rowSpan,
      overlayRect: { x: originRect.left, y: originRect.top, w: originRect.width, h: originRect.height },
    });

    const startCol = widget.colSpan;
    const startRow = widget.rowSpan;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;

      let newCol = startCol as 1 | 2;
      let newRow = startRow as 1 | 2;

      if (direction === 'right' || direction === 'corner') {
        const totalW = originRect.width + dx;
        newCol = totalW > colWidth + gap * 0.5 ? 2 : 1;
      }
      if (direction === 'bottom' || direction === 'corner') {
        const totalH = originRect.height + dy;
        newRow = totalH > rowHeight + gap * 0.5 ? 2 : 1;
      }

      const previewW = newCol * colWidth + (newCol - 1) * gap;
      const previewH = newRow * rowHeight + (newRow - 1) * gap;

      setResizeState(prev => ({
        ...prev,
        previewCol: newCol,
        previewRow: newRow,
        overlayRect: { x: originRect.left, y: originRect.top, w: previewW, h: previewH },
      }));
    };

    const onUp = () => {
      const final = { ...resizeState };
      // Apply resize from current state
      setResizeState(prev => {
        handleResize(id, prev.previewCol, prev.previewRow);
        triggerHaptic('medium');
        return defaultResize;
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [localWidgets, handleResize]);

  /* ── Save / Cancel ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to ALL devices so layout persists everywhere
      await saveGridLayout({ widgets: localWidgets }, true);
      toast.success('Layout saved for all devices! 🎨');
      onEditingChange(false);
    } catch (err) {
      console.error('Failed to save:', err);
      toast.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalWidgets(config.widgets);
    onEditingChange(false);
  };

  const ctx: EditModeCtx = {
    isEditing: editing,
    localWidgets: editing ? localWidgets : config.widgets,
    selectedWidget,
    setSelectedWidget,
    handleToggle,
    handleResize,
    orderedEnabledIds,
    handleReorder,
    dragState,
    resizeState,
    startDrag,
    gridRef,
  };

  return (
    <EditModeContext.Provider value={ctx}>
      <ResizeCtx.Provider value={{ handleResizeStart }}>
        {editing && <style>{jiggleCSS}</style>}
        <AnimatePresence>
          {editing && <EditToolbar saving={saving} variant={variant} onSave={handleSave} onCancel={handleCancel} />}
        </AnimatePresence>
        {editing && <div className="h-24" />}
        <div onPointerDown={editing ? (e) => {
          // Only deselect if tapping the background, not a widget
          const target = e.target as HTMLElement;
          if (!target.closest('[data-widget-id]') && !target.closest('[data-widget-control]') && !target.closest('[data-resize-handle]')) {
            setSelectedWidget(null);
          }
        } : undefined}>
          {children}
        </div>
        <DragGhost dragState={dragState} dragCloneRef={dragCloneRef} />
        <ResizeOverlay resizeState={resizeState} />
      </ResizeCtx.Provider>
    </EditModeContext.Provider>
  );
}
