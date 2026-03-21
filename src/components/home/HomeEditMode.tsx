import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { X, Eye, Check, Smartphone, Monitor, GripVertical, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState } from '@/hooks/useGridLayout';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

/* ── Context ── */
interface EditModeCtx {
  isEditing: boolean;
  localWidgets: GridWidgetState[];
  selectedWidget: string | null;
  setSelectedWidget: (id: string | null) => void;
  handleToggle: (id: string) => void;
  handleResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
  orderedEnabledIds: string[];
  handleReorder: (fromId: string, toId: string) => void;
  dragState: DragState;
  startDrag: (id: string, e: React.PointerEvent) => void;
}

interface DragState {
  isDragging: boolean;
  dragId: string | null;
  ghostX: number;
  ghostY: number;
  hoverTargetId: string | null;
}

const EditModeContext = createContext<EditModeCtx>({
  isEditing: false,
  localWidgets: [],
  selectedWidget: null,
  setSelectedWidget: () => {},
  handleToggle: () => {},
  handleResize: () => {},
  orderedEnabledIds: [],
  handleReorder: () => {},
  dragState: { isDragging: false, dragId: null, ghostX: 0, ghostY: 0, hoverTargetId: null },
  startDrag: () => {},
});

export const useEditMode = () => useContext(EditModeContext);

/* ── Jiggle CSS ── */
const jiggleCSS = `
@keyframes widget-jiggle {
  0%   { transform: rotate(-0.4deg); }
  25%  { transform: rotate(0.4deg); }
  50%  { transform: rotate(-0.4deg); }
  75%  { transform: rotate(0.4deg); }
  100% { transform: rotate(-0.4deg); }
}
.widget-jiggle { animation: widget-jiggle 0.3s ease-in-out infinite; }
.widget-jiggle-dragging { animation: none !important; opacity: 0.3; }
`;

const layoutSpring = { type: 'spring' as const, damping: 30, stiffness: 400, mass: 0.6 };

/* ── Drag-to-resize handle ── */
function ResizeHandle({
  widgetId,
  direction,
  widget,
  onResize,
}: {
  widgetId: string;
  direction: 'right' | 'bottom' | 'corner';
  widget: GridWidgetState;
  onResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
}) {
  const startRef = useRef({ x: 0, y: 0, col: widget.colSpan, row: widget.rowSpan });

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY, col: widget.colSpan, row: widget.rowSpan };
    triggerHaptic('light');

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      const threshold = 40;

      let newCol = startRef.current.col as 1 | 2;
      let newRow = startRef.current.row as 1 | 2;

      if (direction === 'right' || direction === 'corner') {
        newCol = dx > threshold ? 2 : dx < -threshold ? 1 : startRef.current.col as 1 | 2;
      }
      if (direction === 'bottom' || direction === 'corner') {
        newRow = dy > threshold ? 2 : dy < -threshold ? 1 : startRef.current.row as 1 | 2;
      }

      if (newCol !== widget.colSpan || newRow !== widget.rowSpan) {
        onResize(widgetId, newCol, newRow);
        triggerHaptic('light');
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const base = "absolute z-30 touch-none";

  if (direction === 'right') {
    return (
      <div
        onPointerDown={onPointerDown}
        className={cn(base, "top-1/2 -right-2.5 -translate-y-1/2 w-5 h-10 rounded-full bg-primary/90 shadow-lg shadow-primary/25 flex items-center justify-center cursor-ew-resize backdrop-blur-sm")}
      >
        <div className="w-[2px] h-4 rounded-full bg-primary-foreground/80" />
      </div>
    );
  }

  if (direction === 'bottom') {
    return (
      <div
        onPointerDown={onPointerDown}
        className={cn(base, "-bottom-2.5 left-1/2 -translate-x-1/2 h-5 w-10 rounded-full bg-primary/90 shadow-lg shadow-primary/25 flex items-center justify-center cursor-ns-resize backdrop-blur-sm")}
      >
        <div className="h-[2px] w-4 rounded-full bg-primary-foreground/80" />
      </div>
    );
  }

  // Corner
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(base, "-bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-primary/90 shadow-lg shadow-primary/25 flex items-center justify-center cursor-nwse-resize border-2 border-background backdrop-blur-sm")}
    >
      <Maximize2 className="h-2.5 w-2.5 text-primary-foreground/80 rotate-90" />
    </div>
  );
}

/* ── Editable wrapper for each widget ── */
export function EditableWidgetWrapper({
  widgetId,
  children,
  className,
}: {
  widgetId: string;
  children: ReactNode;
  className?: string;
}) {
  const {
    isEditing, localWidgets, selectedWidget, setSelectedWidget,
    handleToggle, handleResize, dragState, startDrag,
  } = useEditMode();
  const widget = localWidgets.find(w => w.id === widgetId);

  if (!isEditing || !widget) return <>{children}</>;

  const isSelected = selectedWidget === widgetId;
  const isBeingDragged = dragState.dragId === widgetId;
  const isHoverTarget = dragState.hoverTargetId === widgetId;

  return (
    <motion.div
      layout
      layoutId={`widget-${widgetId}`}
      transition={layoutSpring}
      data-widget-id={widgetId}
      className={cn(
        'relative touch-none select-none',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
        isBeingDragged && 'widget-jiggle-dragging',
        !isBeingDragged && 'widget-jiggle',
        className,
      )}
      style={{
        animationDelay: `${(widget.order % 5) * 0.05}s`,
        zIndex: isSelected ? 20 : isBeingDragged ? 0 : 1,
      }}
      onClick={(e) => { e.stopPropagation(); setSelectedWidget(isSelected ? null : widgetId); }}
    >
      {/* Content card */}
      <motion.div
        layout
        transition={layoutSpring}
        className={cn(
          'relative rounded-2xl overflow-hidden h-full transition-all duration-200',
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20'
            : 'ring-1 ring-border/30',
          isHoverTarget && !isBeingDragged && 'ring-2 ring-primary/60 scale-[1.04] shadow-md shadow-primary/15',
          !widget.enabled && 'opacity-30 grayscale pointer-events-none',
        )}
      >
        {children}
      </motion.div>

      {/* Drag handle */}
      <motion.div
        onPointerDown={(e) => { e.stopPropagation(); startDrag(widgetId, e); }}
        className="absolute top-1 left-1/2 -translate-x-1/2 z-30 p-1 rounded-full bg-card/80 backdrop-blur border border-border/40 shadow-sm cursor-grab active:cursor-grabbing"
        whileTap={{ scale: 0.85 }}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </motion.div>

      {/* Toggle button */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={e => { e.stopPropagation(); triggerHaptic('medium'); handleToggle(widgetId); }}
        className={cn(
          'absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-lg z-30',
          widget.enabled
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {widget.enabled ? <X className="h-3 w-3" strokeWidth={3} /> : <Eye className="h-3 w-3" strokeWidth={3} />}
      </motion.button>

      {/* Size badge */}
      <div className="absolute -top-1.5 -right-1.5 z-30">
        <span className="text-[8px] font-bold bg-card/90 backdrop-blur border border-border/40 rounded-md px-1.5 py-0.5 shadow-sm text-muted-foreground">
          {widget.colSpan}×{widget.rowSpan}
        </span>
      </div>

      {/* Drag-to-resize handles - always visible when selected */}
      <AnimatePresence>
        {isSelected && widget.enabled && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.12 }}
            >
              <ResizeHandle widgetId={widgetId} direction="right" widget={widget} onResize={handleResize} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.12, delay: 0.02 }}
            >
              <ResizeHandle widgetId={widgetId} direction="bottom" widget={widget} onResize={handleResize} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.12, delay: 0.04 }}
            >
              <ResizeHandle widgetId={widgetId} direction="corner" widget={widget} onResize={handleResize} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── The grid wrapper ── */
export function EditableWidgetList({ children }: { children: ReactNode }) {
  const { isEditing } = useEditMode();
  if (!isEditing) return <>{children}</>;
  return (
    <LayoutGroup>
      <div className="grid grid-cols-2 gap-3 px-3 auto-rows-auto">
        {children}
      </div>
    </LayoutGroup>
  );
}

/* ── Non-edit grid wrapper ── */
export function WidgetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 auto-rows-auto">
      {children}
    </div>
  );
}

/* ── Floating drag ghost ── */
function DragGhost({ widgets, dragState }: { widgets: GridWidgetState[]; dragState: DragState }) {
  const w = widgets.find(x => x.id === dragState.dragId);
  if (!dragState.isDragging || !w) return null;

  return (
    <motion.div
      initial={{ scale: 1, opacity: 0.9 }}
      animate={{ scale: 1.08, opacity: 0.85 }}
      className="fixed z-[100] pointer-events-none"
      style={{
        left: dragState.ghostX - 50,
        top: dragState.ghostY - 30,
        width: w.colSpan === 2 ? 180 : 90,
      }}
    >
      <div className="bg-card/90 backdrop-blur-xl rounded-2xl border-2 border-primary shadow-2xl shadow-primary/30 p-2.5 flex items-center justify-center gap-1.5">
        <span className="text-base">{w.icon}</span>
        <span className="text-[10px] font-bold text-foreground truncate">{w.label}</span>
      </div>
    </motion.div>
  );
}

/* ── Floating toolbar ── */
function EditToolbar({
  saving,
  variant,
  onSave,
  onCancel,
}: {
  saving: boolean;
  variant: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed top-0 left-0 right-0 z-[60] px-3 pt-[max(env(safe-area-inset-top),8px)] pb-2 bg-card/90 backdrop-blur-xl border-b border-border/50 shadow-lg"
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
        Drag grip to move · Tap to select · Drag edges to resize
      </p>
    </motion.div>
  );
}

/* ── Provider wraps home content ── */
export function HomeEditModeProvider({
  editing,
  onEditingChange,
  children,
}: {
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const { config, variant, saveGridLayout } = useGridLayout();
  const [localWidgets, setLocalWidgets] = useState<GridWidgetState[]>(config.widgets);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false, dragId: null, ghostX: 0, ghostY: 0, hoverTargetId: null,
  });

  const widgetRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useEffect(() => {
    if (editing) {
      setLocalWidgets(config.widgets);
      setSelectedWidget(null);
    }
  }, [editing, config.widgets]);

  const orderedEnabledIds = localWidgets
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)
    .map(w => w.id);

  const handleToggle = useCallback((id: string) => {
    setLocalWidgets(prev => prev.map(w =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    ));
  }, []);

  const handleResize = useCallback((id: string, col: 1 | 2, row: 1 | 2) => {
    setLocalWidgets(prev => prev.map(w =>
      w.id === id ? { ...w, colSpan: col, rowSpan: row } : w
    ));
  }, []);

  const handleReorder = useCallback((fromId: string, toId: string) => {
    setLocalWidgets(prev => {
      const updated = [...prev];
      const fromIdx = updated.findIndex(w => w.id === fromId);
      const toIdx = updated.findIndex(w => w.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const fromOrder = updated[fromIdx].order;
      const toOrder = updated[toIdx].order;
      updated[fromIdx] = { ...updated[fromIdx], order: toOrder };
      updated[toIdx] = { ...updated[toIdx], order: fromOrder };
      return updated.sort((a, b) => a.order - b.order);
    });
    triggerHaptic('light');
  }, []);

  // ── Pointer-based drag system ──
  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    triggerHaptic('medium');

    const rects = new Map<string, DOMRect>();
    document.querySelectorAll('[data-widget-id]').forEach(el => {
      const wid = el.getAttribute('data-widget-id');
      if (wid) rects.set(wid, el.getBoundingClientRect());
    });
    widgetRectsRef.current = rects;

    setDragState({
      isDragging: true, dragId: id,
      ghostX: e.clientX, ghostY: e.clientY,
      hoverTargetId: null,
    });
    setSelectedWidget(null);

    let lastSwap = 0;

    const onMove = (ev: PointerEvent) => {
      const gx = ev.clientX;
      const gy = ev.clientY;

      let hoverId: string | null = null;
      for (const [wid, rect] of widgetRectsRef.current.entries()) {
        if (wid === id) continue;
        if (gx >= rect.left && gx <= rect.right && gy >= rect.top && gy <= rect.bottom) {
          hoverId = wid;
          break;
        }
      }

      setDragState(prev => ({ ...prev, ghostX: gx, ghostY: gy, hoverTargetId: hoverId }));

      // Auto-swap
      const now = Date.now();
      if (hoverId && now - lastSwap > 180) {
        lastSwap = now;
        handleReorder(id, hoverId);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newRects = new Map<string, DOMRect>();
            document.querySelectorAll('[data-widget-id]').forEach(el => {
              const w = el.getAttribute('data-widget-id');
              if (w) newRects.set(w, el.getBoundingClientRect());
            });
            widgetRectsRef.current = newRects;
          });
        });
      }
    };

    const onUp = () => {
      setDragState({ isDragging: false, dragId: null, ghostX: 0, ghostY: 0, hoverTargetId: null });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [handleReorder]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGridLayout({ widgets: localWidgets });
      toast.success(`${variant === 'mobile' ? 'Mobile' : 'Desktop'} layout saved! 🎨`);
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
    startDrag,
  };

  return (
    <EditModeContext.Provider value={ctx}>
      {editing && <style>{jiggleCSS}</style>}
      <AnimatePresence>
        {editing && <EditToolbar saving={saving} variant={variant} onSave={handleSave} onCancel={handleCancel} />}
      </AnimatePresence>
      {editing && <div className="h-20" />}
      <div onClick={editing ? () => setSelectedWidget(null) : undefined}>
        {children}
      </div>
      <DragGhost widgets={localWidgets} dragState={dragState} />
    </EditModeContext.Provider>
  );
}
