import { useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Eye, EyeOff, LayoutGrid, X, Check, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHomeLayout, WidgetState } from '@/hooks/useHomeLayout';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenCommandBar?: () => void;
}

function DraggableWidgetRow({
  widget,
  onToggle,
}: {
  widget: WidgetState;
  onToggle: (id: string) => void;
}) {
  return (
    <Reorder.Item
      value={widget.id}
      id={widget.id}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-colors select-none',
        widget.enabled
          ? 'bg-card border-border/60 hover:border-primary/40'
          : 'bg-muted/30 border-border/30 opacity-60'
      )}
      whileDrag={{ scale: 1.03, boxShadow: '0 8px 32px -8px hsl(var(--primary) / 0.3)', zIndex: 50 }}
      dragListener
    >
      <span className="text-xl shrink-0">{widget.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm', !widget.enabled && 'text-muted-foreground')}>
          {widget.label}
        </p>
        <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
      </div>
      <Switch
        checked={widget.enabled}
        onCheckedChange={() => onToggle(widget.id)}
        className="shrink-0"
        aria-label={`Toggle ${widget.label}`}
      />
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </div>
    </Reorder.Item>
  );
}

export function HomeWidgetCustomizer({ open, onOpenChange, onOpenCommandBar }: Props) {
  const { widgets, reorderWidgets, toggleWidget } = useHomeLayout();
  const [localOrder, setLocalOrder] = useState<string[]>(widgets.map(w => w.id));

  // Sync when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) setLocalOrder(widgets.map(w => w.id));
    else handleSave();
    onOpenChange(v);
  };

  const orderedWidgets = localOrder
    .map(id => widgets.find(w => w.id === id))
    .filter(Boolean) as WidgetState[];

  const handleReorder = (newOrder: string[]) => {
    setLocalOrder(newOrder);
  };

  const handleSave = () => {
    reorderWidgets(localOrder);
    toast.success('Your VYBE layout saved! 🔥');
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center">
                <LayoutGrid className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-base">Your Home Layout</SheetTitle>
                <p className="text-xs text-muted-foreground">Drag to reorder · toggle to show/hide</p>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* AI Redesign Banner */}
        <button
          onClick={() => {
            onOpenChange(false);
            onOpenCommandBar?.();
          }}
          className="shrink-0 mb-3 flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/15 via-accent/15 to-primary/15 border border-primary/25 hover:border-primary/50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg gradient-animated flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold">Ask VYBE AI to redesign</p>
            <p className="text-xs text-muted-foreground">
              "Make my app feel neon & dark" → instant magic ✨
            </p>
          </div>
        </button>

        {/* Draggable Widget List */}
        <div className="flex-1 overflow-y-auto">
          <Reorder.Group
            axis="y"
            values={localOrder}
            onReorder={handleReorder}
            className="space-y-2 pb-4"
          >
            <AnimatePresence initial={false}>
              {orderedWidgets.map(widget => (
                <DraggableWidgetRow
                  key={widget.id}
                  widget={widget}
                  onToggle={toggleWidget}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </div>

        <div className="shrink-0 pt-2 border-t border-border/50">
          <Button
            onClick={() => { handleSave(); onOpenChange(false); }}
            className="w-full gradient-animated text-white font-semibold"
          >
            <Check className="h-4 w-4 mr-2" />
            Save My VYBE Layout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
