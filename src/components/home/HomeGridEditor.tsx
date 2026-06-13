import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  GripVertical, Eye, EyeOff, Maximize2, Minimize2,
  Image, Type, Sparkles, Share2, Check, X, Save,
  RectangleHorizontal, Square, Columns,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState, type GridLayoutConfig } from '@/hooks/useGridLayout';
import { useShareTheme, type LayoutSettings } from '@/hooks/useSharedThemes';
import { useUserTheme } from '@/hooks/useCustomTheme';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenCommandBar?: () => void;
}

const SIZE_OPTIONS: { label: string; icon: any; col: 1 | 2; row: 1 | 2 }[] = [
  { label: 'Small', icon: Square, col: 1, row: 1 },
  { label: 'Wide', icon: RectangleHorizontal, col: 2, row: 1 },
  { label: 'Tall', icon: Columns, col: 1, row: 2 },
  { label: 'Large', icon: Maximize2, col: 2, row: 2 },
];

const CORNER_OPTIONS = [
  { value: 'sharp' as const, label: 'Sharp' },
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'pill' as const, label: 'Pill' },
];

const MOTION_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'subtle' as const, label: 'Subtle' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'extra' as const, label: 'Extra' },
];

function WidgetGridItem({
  widget,
  selected,
  onSelect,
  onToggle,
}: {
  widget: GridWidgetState;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      className={cn(
        'relative rounded-xl border-2 p-3 transition-all cursor-pointer select-none',
        widget.enabled
          ? selected
            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
            : 'border-border/60 bg-card hover:border-primary/40'
          : 'border-border/30 bg-muted/20 opacity-50',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
      )}
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
      style={{ minHeight: widget.rowSpan === 2 ? '120px' : '60px' }}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg">{widget.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{widget.label}</p>
          {widget.rowSpan > 1 && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{widget.description}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0 p-1 rounded-lg hover:bg-muted/50"
        >
          {widget.enabled
            ? <Eye className="h-3.5 w-3.5 text-primary" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
      </div>
      {selected && (
        <motion.div
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          <Check className="h-3 w-3 text-primary-foreground" />
        </motion.div>
      )}
    </motion.div>
  );
}

export function HomeGridEditor({ open, onOpenChange, onOpenCommandBar }: Props) {
  const { config, saveGridLayout, toggleWidget, resizeWidget, reorderWidgets } = useGridLayout();
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('layout');
  const [showShareFlow, setShowShareFlow] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [themeDesc, setThemeDesc] = useState('');
  const [localConfig, setLocalConfig] = useState<GridLayoutConfig>(config);
  const { user } = useAuth();
  const shareTheme = useShareTheme();
  const { data: userTheme } = useUserTheme();

  const handleOpen = (v: boolean) => {
    if (v) {
      setLocalConfig(config);
      setSelectedWidget(null);
      setShowShareFlow(false);
    }
    onOpenChange(v);
  };

  const selectedDef = localConfig.widgets.find(w => w.id === selectedWidget);

  const handleResize = (col: 1 | 2, row: 1 | 2) => {
    if (!selectedWidget) return;
    setLocalConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === selectedWidget ? { ...w, colSpan: col, rowSpan: row } : w
      ),
    }));
  };

  const handleToggle = (id: string) => {
    setLocalConfig(prev => ({
      ...prev,
      widgets: prev.widgets.map(w =>
        w.id === id ? { ...w, enabled: !w.enabled } : w
      ),
    }));
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGridLayout(localConfig);
      toast.success('Layout saved! 🔥');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save layout:', err);
      toast.error('Failed to save layout. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = () => {
    if (!themeName.trim()) {
      toast.error('Give your theme a name!');
      return;
    }
    if (!userTheme?.theme_tokens) {
      toast.error('Apply a theme first before sharing!');
      return;
    }

    const layoutSettings: LayoutSettings = {
      widget_order: localConfig.widgets.filter(w => w.enabled).map(w => w.id),
      widget_hidden: localConfig.widgets.filter(w => !w.enabled).map(w => w.id),
      background_url: localConfig.background_url,
      corner_style: localConfig.corner_style,
      motion_intensity: localConfig.motion_intensity,
      font_heading: localConfig.font_heading,
      font_body: localConfig.font_body,
    };

    shareTheme.mutate({
      themeName: themeName.trim(),
      themeTokens: userTheme.theme_tokens as any,
      description: themeDesc.trim() || undefined,
      layoutSettings,
      tags: ['community', 'full-layout'],
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
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90dvh] overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0 pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Edit Home Layout</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">Tap widgets to select · resize · drag to reorder</p>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0 w-full h-9 bg-muted/50">
            <TabsTrigger value="layout" className="flex-1 text-xs">Layout</TabsTrigger>
            <TabsTrigger value="style" className="flex-1 text-xs">Style</TabsTrigger>
          </TabsList>

          {/* Layout Tab */}
          <TabsContent value="layout" className="flex-1 overflow-y-auto mt-3">
            {/* Grid Preview */}
            <div className="grid grid-cols-2 gap-2 pb-3">
              {localConfig.widgets
                .sort((a, b) => a.order - b.order)
                .map(widget => (
                  <WidgetGridItem
                    key={widget.id}
                    widget={widget}
                    selected={selectedWidget === widget.id}
                    onSelect={() => setSelectedWidget(selectedWidget === widget.id ? null : widget.id)}
                    onToggle={() => handleToggle(widget.id)}
                  />
                ))}
            </div>

            {/* Size Controls for Selected Widget */}
            <AnimatePresence>
              {selectedDef && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-2 mb-3">
                    <p className="text-xs font-semibold flex items-center gap-2">
                      <span>{selectedDef.icon}</span>
                      Resize {selectedDef.label}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {SIZE_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const active = selectedDef.colSpan === opt.col && selectedDef.rowSpan === opt.row;
                        return (
                          <button
                            key={opt.label}
                            onClick={() => handleResize(opt.col, opt.row)}
                            className={cn(
                              'flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border/50 hover:border-primary/40 text-muted-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-[10px] font-medium">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Style Tab */}
          <TabsContent value="style" className="flex-1 overflow-y-auto mt-3 space-y-4">
            {/* Background */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Background</p>
              <Input
                placeholder="Image URL (or use AI designer)"
                value={localConfig.background_url || ''}
                onChange={e => setLocalConfig(p => ({ ...p, background_url: e.target.value || null }))}
                className="text-sm"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Opacity</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={localConfig.background_opacity}
                  onChange={e => setLocalConfig(p => ({ ...p, background_opacity: Number(e.target.value) }))}
                  className="flex-1 accent-primary"
                />
                <span className="text-xs font-mono w-8 text-right">{localConfig.background_opacity}%</span>
              </div>
            </div>

            {/* Corner Style */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Corners</p>
              <div className="flex gap-2">
                {CORNER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLocalConfig(p => ({ ...p, corner_style: opt.value }))}
                    className={cn(
                      'flex-1 py-2 text-xs font-medium border transition-colors',
                      opt.value === 'sharp' ? 'rounded-none' : opt.value === 'rounded' ? 'rounded-lg' : 'rounded-full',
                      localConfig.corner_style === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/50 text-muted-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Motion */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Motion</p>
              <div className="grid grid-cols-4 gap-2">
                {MOTION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLocalConfig(p => ({ ...p, motion_intensity: opt.value }))}
                    className={cn(
                      'py-2 text-xs font-medium rounded-lg border transition-colors',
                      localConfig.motion_intensity === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/50 text-muted-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fonts */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fonts</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Headings</label>
                  <Input
                    value={localConfig.font_heading}
                    onChange={e => setLocalConfig(p => ({ ...p, font_heading: e.target.value }))}
                    className="text-xs h-8"
                    placeholder="e.g. Inter, Poppins"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Body</label>
                  <Input
                    value={localConfig.font_body}
                    onChange={e => setLocalConfig(p => ({ ...p, font_body: e.target.value }))}
                    className="text-xs h-8"
                    placeholder="e.g. system-ui"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

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
                  <Button variant="outline" size="sm" onClick={() => setShowShareFlow(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleShare}
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

        {/* Actions */}
        <div className="shrink-0 pt-2 border-t border-border/50 space-y-2">
          <Button onClick={handleSave} disabled={saving} className="w-full gradient-animated text-white font-semibold">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Layout'}
          </Button>
          {user && (
            <Button variant="outline" onClick={() => setShowShareFlow(!showShareFlow)} className="w-full">
              <Share2 className="h-4 w-4 mr-2" />
              Share with Community
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
