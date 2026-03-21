import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { X, Eye, Check, Smartphone, Monitor, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState, type GridLayoutConfig } from '@/hooks/useGridLayout';
import { toast } from 'sonner';

/* ── Context so child widgets know they're in edit mode ── */
interface EditModeContextValue {
  isEditing: boolean;
  localWidgets: GridWidgetState[];
  selectedWidget: string | null;
  setSelectedWidget: (id: string | null) => void;
  handleToggle: (id: string) => void;
  handleResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
}

const EditModeContext = createContext<EditModeContextValue>({
  isEditing: false,
  localWidgets: [],
  selectedWidget: null,
  setSelectedWidget: () => {},
  handleToggle: () => {},
  handleResize: () => {},
});

export const useEditMode = () => useContext(EditModeContext);

/* ── Jiggle keyframes (CSS-based for perf) ── */
const jiggleStyle = `
@keyframes widget-jiggle {
  0% { transform: rotate(-0.6deg); }
  50% { transform: rotate(0.6deg); }
  100% { transform: rotate(-0.6deg); }
}
`;

/* ── Resize handle component ── */
function ResizeHandle({
  position,
  onResizeStart,
}: {
  position: 'right' | 'bottom' | 'corner';
  onResizeStart: (dir: 'right' | 'bottom' | 'corner') => void;
}) {
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResizeStart(position);
      }}
      className={cn(
        'absolute z-20 transition-opacity',
        position === 'right' && 'top-2 -right-1.5 bottom-2 w-3 cursor-ew-resize flex items-center justify-center',
        position === 'bottom' && '-bottom-1.5 left-2 right-2 h-3 cursor-ns-resize flex items-center justify-center',
        position === 'corner' && '-bottom-2 -right-2 w-5 h-5 cursor-nwse-resize rounded-full',
      )}
    >
      {position === 'right' && (
        <div className="w-1 h-8 rounded-full bg-primary/60" />
      )}
      {position === 'bottom' && (
        <div className="h-1 w-8 rounded-full bg-primary/60" />
      )}
      {position === 'corner' && (
        <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-md" />
      )}
    </div>
  );
}

/* ── Inline editable widget wrapper ── */
export function EditableWidgetWrapper({
  widgetId,
  children,
  className,
}: {
  widgetId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { isEditing, localWidgets, selectedWidget, setSelectedWidget, handleToggle, handleResize } = useEditMode();
  const widget = localWidgets.find(w => w.id === widgetId);

  if (!isEditing || !widget) {
    return <>{children}</>;
  }

  const isSelected = selectedWidget === widgetId;

  const cycleSize = (dir: 'right' | 'bottom' | 'corner') => {
    const { colSpan, rowSpan } = widget;
    if (dir === 'right') {
      handleResize(widgetId, colSpan === 1 ? 2 : 1, rowSpan);
    } else if (dir === 'bottom') {
      handleResize(widgetId, colSpan, rowSpan === 1 ? 2 : 1);
    } else {
      // Corner: cycle through sizes
      if (colSpan === 1 && rowSpan === 1) handleResize(widgetId, 2, 1);
      else if (colSpan === 2 && rowSpan === 1) handleResize(widgetId, 2, 2);
      else if (colSpan === 2 && rowSpan === 2) handleResize(widgetId, 1, 2);
      else handleResize(widgetId, 1, 1);
    }
  };

  return (
    <div
      className={cn(
        'relative group',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
        className,
      )}
      style={{
        animation: 'widget-jiggle 0.25s ease-in-out infinite',
        animationDelay: `${Math.random() * 0.15}s`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedWidget(isSelected ? null : widgetId);
      }}
    >
      {/* Content with edit border */}
      <div
        className={cn(
          'relative rounded-2xl transition-all overflow-hidden',
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20'
            : 'ring-1 ring-border/60',
          !widget.enabled && 'opacity-40 grayscale',
        )}
      >
        {children}
      </div>

      {/* Remove button (top-left, Apple style) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleToggle(widgetId);
        }}
        className={cn(
          'absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg z-30 transition-all',
          widget.enabled
            ? 'bg-destructive text-destructive-foreground hover:scale-110'
            : 'bg-primary text-primary-foreground hover:scale-110'
        )}
      >
        {widget.enabled ? <X className="h-3 w-3" strokeWidth={3} /> : <Eye className="h-3 w-3" strokeWidth={3} />}
      </button>

      {/* Size label badge */}
      <div className="absolute -top-2 -right-2 z-30">
        <span className="text-[9px] font-bold bg-card/90 backdrop-blur border border-border/60 rounded-md px-1.5 py-0.5 shadow-sm text-muted-foreground">
          {widget.colSpan}×{widget.rowSpan}
        </span>
      </div>

      {/* Resize handles - only show when selected */}
      {isSelected && widget.enabled && (
        <>
          <ResizeHandle position="right" onResizeStart={cycleSize} />
          <ResizeHandle position="bottom" onResizeStart={cycleSize} />
          <ResizeHandle position="corner" onResizeStart={cycleSize} />
        </>
      )}
    </div>
  );
}

/* ── Floating toolbar when editing ── */
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-sm font-medium text-muted-foreground"
        >
          Cancel
        </Button>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg px-1 py-0.5">
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-1',
              variant === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
            )}>
              <Smartphone className="h-2.5 w-2.5" />
              Mobile
            </span>
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-1',
              variant === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
            )}>
              <Monitor className="h-2.5 w-2.5" />
              Desktop
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="gradient-animated text-white text-sm font-semibold gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Done'}
        </Button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        Tap widgets to select · grab edges to resize · {variant === 'mobile' ? '📱' : '🖥️'} {variant} layout
      </p>
    </motion.div>
  );
}

/* ── Provider that wraps the home page content ── */
export function HomeEditModeProvider({
  editing,
  onEditingChange,
  children,
}: {
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { config, variant, saveGridLayout } = useGridLayout();
  const [localWidgets, setLocalWidgets] = useState<GridWidgetState[]>(config.widgets);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync when entering edit mode or config changes externally
  useEffect(() => {
    if (editing) {
      setLocalWidgets(config.widgets);
      setSelectedWidget(null);
    }
  }, [editing]); // intentionally only on editing toggle

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

  const ctxValue: EditModeContextValue = {
    isEditing: editing,
    localWidgets: editing ? localWidgets : config.widgets,
    selectedWidget,
    setSelectedWidget,
    handleToggle,
    handleResize,
  };

  return (
    <EditModeContext.Provider value={ctxValue}>
      {/* Inject jiggle CSS */}
      {editing && <style>{jiggleStyle}</style>}

      {/* Floating toolbar */}
      <AnimatePresence>
        {editing && (
          <EditToolbar
            saving={saving}
            variant={variant}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </AnimatePresence>

      {/* Spacer for toolbar */}
      {editing && <div className="h-20" />}

      {/* Clear selection on background click */}
      <div onClick={editing ? () => setSelectedWidget(null) : undefined}>
        {children}
      </div>
    </EditModeContext.Provider>
  );
}
