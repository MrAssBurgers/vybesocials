import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Check, X, Eye, EyeOff, Smartphone, Monitor,
  Square, RectangleHorizontal, Columns, Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState, type GridLayoutConfig, type LayoutVariant } from '@/hooks/useGridLayout';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const SIZE_OPTIONS: { label: string; icon: any; col: 1 | 2; row: 1 | 2 }[] = [
  { label: 'Small', icon: Square, col: 1, row: 1 },
  { label: 'Wide', icon: RectangleHorizontal, col: 2, row: 1 },
  { label: 'Tall', icon: Columns, col: 1, row: 2 },
  { label: 'Large', icon: Maximize2, col: 2, row: 2 },
];

// Apple-style jiggle animation
const jiggleVariant = {
  jiggle: (i: number) => ({
    rotate: [-(0.5 + i * 0.15), (0.5 + i * 0.15), -(0.5 + i * 0.15)],
    transition: {
      rotate: {
        repeat: Infinity,
        duration: 0.3 + i * 0.05,
        ease: 'easeInOut',
      },
    },
  }),
  still: { rotate: 0 },
};

function EditableWidget({
  widget,
  index,
  isSelected,
  onSelect,
  onToggle,
  onResize,
}: {
  widget: GridWidgetState;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onResize: (col: 1 | 2, row: 1 | 2) => void;
}) {
  return (
    <motion.div
      className={cn(
        'relative select-none cursor-pointer',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
      )}
      custom={index}
      variants={jiggleVariant}
      animate="jiggle"
      whileTap={{ scale: 0.92 }}
      onClick={onSelect}
    >
      {/* Widget card */}
      <div
        className={cn(
          'h-full rounded-2xl border-2 p-3 transition-all',
          widget.enabled
            ? isSelected
              ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
              : 'border-border/60 bg-card/80 backdrop-blur-sm'
            : 'border-dashed border-border/40 bg-muted/20 opacity-50',
        )}
        style={{ minHeight: widget.rowSpan === 2 ? '140px' : '72px' }}
      >
        <div className="flex items-start gap-2">
          <span className="text-xl">{widget.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-semibold truncate', !widget.enabled && 'text-muted-foreground')}>
              {widget.label}
            </p>
            {(widget.rowSpan > 1 || widget.colSpan > 1) && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{widget.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Remove / add button (top-left, Apple-style) */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          'absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10 transition-colors',
          widget.enabled
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        )}
      >
        {widget.enabled ? <X className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>

      {/* Resize popover when selected */}
      <AnimatePresence>
        {isSelected && widget.enabled && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-card/95 backdrop-blur-lg border border-border/60 rounded-xl p-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {SIZE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = widget.colSpan === opt.col && widget.rowSpan === opt.row;
              return (
                <button
                  key={opt.label}
                  onClick={() => onResize(opt.col, opt.row)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-medium leading-none">{opt.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function HomeEditMode({ open, onOpenChange }: Props) {
  const { config, variant, saveGridLayout } = useGridLayout();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const [localWidgets, setLocalWidgets] = useState<GridWidgetState[]>(config.widgets);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<'current' | 'other'>('current');

  // Sync local state when edit mode opens
  useEffect(() => {
    if (open) {
      setLocalWidgets(config.widgets);
      setSelectedWidget(null);
      setPreviewVariant('current');
    }
  }, [open, config.widgets]);

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

  const handleReorder = useCallback((newOrder: string[]) => {
    setLocalWidgets(prev => {
      const map = new Map(prev.map(w => [w.id, w]));
      return newOrder.map((id, i) => {
        const w = map.get(id)!;
        return { ...w, order: i };
      });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGridLayout({ widgets: localWidgets });
      toast.success(`${variant === 'mobile' ? 'Mobile' : 'Desktop'} layout saved! 🎨`);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save:', err);
      toast.error('Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalWidgets(config.widgets);
    onOpenChange(false);
  };

  const orderedIds = localWidgets.map(w => w.id);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
        >
          {/* Frosted background */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={() => setSelectedWidget(null)} />

          {/* Top bar */}
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3"
          >
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-sm font-medium">
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                <button
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1',
                    variant === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  )}
                  disabled
                >
                  <Smartphone className="h-3 w-3" />
                  Mobile
                </button>
                <button
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1',
                    variant === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  )}
                  disabled
                >
                  <Monitor className="h-3 w-3" />
                  Desktop
                </button>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gradient-animated text-white text-sm font-semibold"
            >
              {saving ? 'Saving...' : 'Done'}
            </Button>
          </motion.div>

          {/* Variant label */}
          <div className="relative z-10 text-center pb-3">
            <p className="text-xs text-muted-foreground">
              Editing <span className="font-semibold text-foreground">{variant === 'mobile' ? 'Mobile' : 'Desktop'}</span> layout
              {' '}· tap to resize · drag to reorder
            </p>
          </div>

          {/* Widget grid */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-24" onClick={() => setSelectedWidget(null)}>
            <div className="max-w-xl mx-auto">
              <div className="grid grid-cols-2 gap-3">
                {localWidgets.map((widget, i) => (
                  <EditableWidget
                    key={widget.id}
                    widget={widget}
                    index={i}
                    isSelected={selectedWidget === widget.id}
                    onSelect={() => setSelectedWidget(prev => prev === widget.id ? null : widget.id)}
                    onToggle={() => handleToggle(widget.id)}
                    onResize={(col, row) => handleResize(widget.id, col, row)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Bottom hint */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="relative z-10 pb-[max(env(safe-area-inset-bottom),16px)] px-4 text-center"
          >
            <p className="text-[10px] text-muted-foreground">
              {variant === 'mobile' ? '📱' : '🖥️'} Changes only affect your {variant} layout
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
