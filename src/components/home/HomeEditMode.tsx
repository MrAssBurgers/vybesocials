import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { X, Eye, Check, Smartphone, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState } from '@/hooks/useGridLayout';
import { toast } from 'sonner';

/* ── Context ── */
interface EditModeCtx {
  isEditing: boolean;
  localWidgets: GridWidgetState[];
  selectedWidget: string | null;
  setSelectedWidget: (id: string | null) => void;
  handleToggle: (id: string) => void;
  handleResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
  /** Ordered list of enabled widget IDs — drive rendering order */
  orderedEnabledIds: string[];
  /** Reorder callback for Reorder.Group */
  handleReorder: (ids: string[]) => void;
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
});

export const useEditMode = () => useContext(EditModeContext);

/* ── Jiggle CSS ── */
const jiggleCSS = `
@keyframes widget-jiggle {
  0%   { transform: rotate(-0.5deg); }
  50%  { transform: rotate(0.5deg); }
  100% { transform: rotate(-0.5deg); }
}
.widget-jiggle { animation: widget-jiggle 0.22s ease-in-out infinite; }
`;

/* ── Resize handles ── */
function ResizeHandle({ position, onClick }: { position: 'right' | 'bottom' | 'corner'; onClick: () => void }) {
  return (
    <button
      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      className={cn(
        'absolute z-30 touch-none',
        position === 'right' && 'top-3 -right-1.5 bottom-3 w-3 cursor-ew-resize flex items-center justify-center',
        position === 'bottom' && '-bottom-1.5 left-3 right-3 h-3 cursor-ns-resize flex items-center justify-center',
        position === 'corner' && '-bottom-2 -right-2 w-5 h-5 cursor-nwse-resize',
      )}
    >
      {position === 'right' && <div className="w-1 h-8 rounded-full bg-primary/70" />}
      {position === 'bottom' && <div className="h-1 w-8 rounded-full bg-primary/70" />}
      {position === 'corner' && <div className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shadow-lg" />}
    </button>
  );
}

/* ── Editable wrapper for each widget section ── */
export function EditableWidgetWrapper({
  widgetId,
  children,
  className,
}: {
  widgetId: string;
  children: ReactNode;
  className?: string;
}) {
  const { isEditing, localWidgets, selectedWidget, setSelectedWidget, handleToggle, handleResize } = useEditMode();
  const widget = localWidgets.find(w => w.id === widgetId);

  if (!isEditing || !widget) return <>{children}</>;

  const isSelected = selectedWidget === widgetId;

  const cycleSize = (dir: 'right' | 'bottom' | 'corner') => {
    const { colSpan, rowSpan } = widget;
    if (dir === 'right') handleResize(widgetId, colSpan === 1 ? 2 : 1, rowSpan);
    else if (dir === 'bottom') handleResize(widgetId, colSpan, rowSpan === 1 ? 2 : 1);
    else {
      if (colSpan === 1 && rowSpan === 1) handleResize(widgetId, 2, 1);
      else if (colSpan === 2 && rowSpan === 1) handleResize(widgetId, 2, 2);
      else if (colSpan === 2 && rowSpan === 2) handleResize(widgetId, 1, 2);
      else handleResize(widgetId, 1, 1);
    }
  };

  return (
    <Reorder.Item
      value={widgetId}
      id={widgetId}
      dragListener={isEditing}
      className={cn('relative widget-jiggle touch-none', className)}
      style={{ animationDelay: `${(widget.order % 5) * 0.04}s` }}
      whileDrag={{ scale: 1.03, zIndex: 50, boxShadow: '0 12px 40px -8px hsl(var(--primary) / 0.35)' }}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSelectedWidget(isSelected ? null : widgetId); }}
    >
      {/* Content with edit border */}
      <div
        className={cn(
          'relative rounded-2xl transition-all overflow-hidden',
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20'
            : 'ring-1 ring-border/50',
          !widget.enabled && 'opacity-30 grayscale pointer-events-none',
        )}
      >
        {children}
      </div>

      {/* Remove / re-add badge */}
      <button
        onClick={e => { e.stopPropagation(); handleToggle(widgetId); }}
        className={cn(
          'absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg z-30 transition-all',
          widget.enabled
            ? 'bg-destructive text-destructive-foreground hover:scale-110'
            : 'bg-primary text-primary-foreground hover:scale-110',
        )}
      >
        {widget.enabled ? <X className="h-3 w-3" strokeWidth={3} /> : <Eye className="h-3 w-3" strokeWidth={3} />}
      </button>

      {/* Size badge */}
      <div className="absolute -top-2 -right-2 z-30">
        <span className="text-[9px] font-bold bg-card/90 backdrop-blur border border-border/60 rounded-md px-1.5 py-0.5 shadow-sm text-muted-foreground">
          {widget.colSpan}×{widget.rowSpan}
        </span>
      </div>

      {/* Resize handles when selected */}
      {isSelected && widget.enabled && (
        <>
          <ResizeHandle position="right" onClick={() => cycleSize('right')} />
          <ResizeHandle position="bottom" onClick={() => cycleSize('bottom')} />
          <ResizeHandle position="corner" onClick={() => cycleSize('corner')} />
        </>
      )}
    </Reorder.Item>
  );
}

/* ── The reorder group wrapper ── */
export function EditableWidgetList({ children }: { children: ReactNode }) {
  const { isEditing, orderedEnabledIds, handleReorder } = useEditMode();

  if (!isEditing) return <>{children}</>;

  return (
    <Reorder.Group
      axis="y"
      values={orderedEnabledIds}
      onReorder={handleReorder}
      className="space-y-1"
    >
      {children}
    </Reorder.Group>
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
        Drag to reorder · tap to select · grab edges to resize · {variant === 'mobile' ? '📱' : '🖥️'} {variant}
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

  useEffect(() => {
    if (editing) {
      setLocalWidgets(config.widgets);
      setSelectedWidget(null);
    }
  }, [editing]);

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

  const handleReorder = useCallback((ids: string[]) => {
    setLocalWidgets(prev => {
      const map = new Map(prev.map(w => [w.id, w]));
      // Re-number order for enabled ones based on new array order
      const updated = [...prev];
      ids.forEach((id, i) => {
        const idx = updated.findIndex(w => w.id === id);
        if (idx !== -1) updated[idx] = { ...updated[idx], order: i };
      });
      return updated;
    });
  }, []);

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
    </EditModeContext.Provider>
  );
}
