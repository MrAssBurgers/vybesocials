import { useState } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Eye, EyeOff, LayoutGrid, X, Check, Sparkles, Share2, Save } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useHomeLayout, WidgetState } from '@/hooks/useHomeLayout';
import { useShareTheme, type LayoutSettings } from '@/hooks/useSharedThemes';
import { useUserTheme } from '@/hooks/useCustomTheme';
import { useAuth } from '@/lib/auth';
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
  const { widgets, layout, reorderWidgets, toggleWidget } = useHomeLayout();
  const [localOrder, setLocalOrder] = useState<string[]>(widgets.map(w => w.id));
  const [showShareFlow, setShowShareFlow] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [themeDesc, setThemeDesc] = useState('');
  const { user } = useAuth();
  const shareTheme = useShareTheme();
  const { userTheme } = useCustomTheme();

  // Sync when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setLocalOrder(widgets.map(w => w.id));
      setShowShareFlow(false);
    } else {
      handleSave();
    }
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

  const handleShareWithCommunity = () => {
    if (!themeName.trim()) {
      toast.error('Give your theme a name!');
      return;
    }
    if (!userTheme?.theme_tokens) {
      toast.error('Apply a theme first before sharing!');
      return;
    }

    const layoutSettings: LayoutSettings = {
      widget_order: localOrder,
      widget_hidden: layout.hidden,
    };

    shareTheme.mutate({
      themeName: themeName.trim(),
      themeTokens: userTheme.theme_tokens as any,
      description: themeDesc.trim() || undefined,
      layoutSettings,
      tags: ['community'],
      category: 'user-created',
    }, {
      onSuccess: () => {
        setShowShareFlow(false);
        setThemeName('');
        setThemeDesc('');
        onOpenChange(false);
      },
    });
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

        {/* Share Flow */}
        <AnimatePresence>
          {showShareFlow && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="space-y-2 pb-3 border-t border-border/50 pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Share as Theme</p>
                <Input
                  placeholder="Theme name (e.g. 'Midnight Vibes')"
                  value={themeName}
                  onChange={e => setThemeName(e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Description (optional)"
                  value={themeDesc}
                  onChange={e => setThemeDesc(e.target.value)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowShareFlow(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleShareWithCommunity}
                    disabled={shareTheme.isPending}
                    className="flex-1 gradient-animated text-white"
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1.5" />
                    {shareTheme.isPending ? 'Sharing...' : 'Share'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0 pt-2 border-t border-border/50 space-y-2">
          <Button
            onClick={() => { handleSave(); onOpenChange(false); }}
            className="w-full gradient-animated text-white font-semibold"
          >
            <Check className="h-4 w-4 mr-2" />
            Save My VYBE Layout
          </Button>
          {user && (
            <Button
              variant="outline"
              onClick={() => setShowShareFlow(!showShareFlow)}
              className="w-full"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share with Community
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

