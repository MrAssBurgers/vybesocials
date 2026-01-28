import { useState, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Grip,
  Eye,
  EyeOff,
  Undo2,
  RotateCcw,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Layout,
  Navigation,
  Palette,
  Home,
  Compass,
  Upload,
  MessageCircle,
  User,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useUISettings,
  useSaveUISettings,
  useResetUISettings,
  DEFAULT_UI_SETTINGS,
  LayoutModule,
  NavTab,
  UISettings,
  PageLayout,
} from '@/hooks/useUISettings';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* --------------------------------------------------------------------------
   Constants
-------------------------------------------------------------------------- */
const NAV_ICONS: Record<NavTab, React.ComponentType<{ className?: string }>> = {
  home: Home,
  explore: Compass,
  upload: Upload,
  messages: MessageCircle,
  profile: User,
};

const NAV_LABELS: Record<NavTab, string> = {
  home: 'Home',
  explore: 'Explore',
  upload: 'Create',
  messages: 'Messages',
  profile: 'Profile',
};

const STEPS = ['Layout', 'Tabs', 'Style'] as const;
type Step = (typeof STEPS)[number];

/* --------------------------------------------------------------------------
   Wizard Component
-------------------------------------------------------------------------- */
interface UIBuilderWizardProps {
  onClose: () => void;
}

export const UIBuilderWizard = memo(function UIBuilderWizard({
  onClose,
}: UIBuilderWizardProps) {
  const { data: currentSettings } = useUISettings();
  const saveSettings = useSaveUISettings();
  const resetSettings = useResetUISettings();

  // Working copy of settings
  const [settings, setSettings] = useState<UISettings>(
    currentSettings || DEFAULT_UI_SETTINGS
  );

  // History for undo
  const [history, setHistory] = useState<UISettings[]>([
    currentSettings || DEFAULT_UI_SETTINGS,
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Wizard step (0-based index into STEPS)
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];

  // Page being edited in Layout step
  const [layoutPage, setLayoutPage] = useState<keyof PageLayout>('home');

  const hasChanges = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(currentSettings),
    [settings, currentSettings]
  );

  /* ----------------------------- History helpers -------------------------- */
  const pushHistory = useCallback(
    (next: UISettings) => {
      const updated = history.slice(0, historyIndex + 1);
      updated.push(next);
      setHistory(updated);
      setHistoryIndex(updated.length - 1);
      setSettings(next);
    },
    [history, historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((i) => i - 1);
      setSettings(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const handleReset = useCallback(() => {
    pushHistory(DEFAULT_UI_SETTINGS);
    toast.success('Reset to defaults');
  }, [pushHistory]);

  /* ----------------------------- Save -------------------------------------- */
  const handleSave = useCallback(async () => {
    await saveSettings.mutateAsync(settings);
    toast.success('Saved!');
    onClose();
  }, [settings, saveSettings, onClose]);

  /* ----------------------------- Layout logic ------------------------------ */
  const handleModuleReorder = useCallback(
    (page: keyof PageLayout, newOrder: LayoutModule[]) => {
      const updated = newOrder.map((m, i) => ({ ...m, order: i }));
      pushHistory({
        ...settings,
        layouts: { ...settings.layouts, [page]: updated },
      });
    },
    [settings, pushHistory]
  );

  const handleModuleToggle = useCallback(
    (page: keyof PageLayout, moduleId: string) => {
      const modules = settings.layouts[page].map((m) =>
        m.id === moduleId ? { ...m, visible: !m.visible } : m
      );
      if (!modules.some((m) => m.visible)) {
        toast.error('At least one section must stay visible');
        return;
      }
      pushHistory({
        ...settings,
        layouts: { ...settings.layouts, [page]: modules },
      });
    },
    [settings, pushHistory]
  );

  /* ----------------------------- Tabs logic -------------------------------- */
  const handleNavToggle = useCallback(
    (tab: NavTab) => {
      if (tab === 'home') {
        toast.error('Home tab must remain visible');
        return;
      }
      let newTabs: NavTab[];
      if (settings.navTabs.includes(tab)) {
        newTabs = settings.navTabs.filter((t) => t !== tab);
        if (newTabs.length < 3) {
          toast.error('At least 3 tabs required');
          return;
        }
      } else {
        newTabs = [...settings.navTabs, tab];
      }
      pushHistory({
        ...settings,
        navTabs: newTabs,
        navOrder: newTabs.map((_, i) => i),
      });
    },
    [settings, pushHistory]
  );

  const handleNavReorder = useCallback(
    (newTabs: NavTab[]) => {
      // Ensure home is first
      if (newTabs[0] !== 'home') {
        newTabs = ['home', ...newTabs.filter((t) => t !== 'home')];
      }
      pushHistory({
        ...settings,
        navTabs: newTabs,
        navOrder: newTabs.map((_, i) => i),
      });
    },
    [settings, pushHistory]
  );

  /* ----------------------------- Style logic ------------------------------- */
  const handleStyleChange = useCallback(
    <K extends keyof UISettings>(key: K, value: UISettings[K]) => {
      pushHistory({ ...settings, [key]: value });
    },
    [settings, pushHistory]
  );

  /* ----------------------------- Step navigation --------------------------- */
  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const canUndo = historyIndex > 0;

  /* =========================================================================
     Render
  ========================================================================= */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      {/* Header ----------------------------------------------------------- */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Customize UI</h1>
            <p className="text-xs text-muted-foreground">
              Step {stepIndex + 1} of {STEPS.length}: {currentStep}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleReset} title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Stepper indicators ------------------------------------------------ */}
      <div className="flex justify-center gap-3 py-4 bg-muted/30">
        {STEPS.map((label, idx) => {
          const done = idx < stepIndex;
          const active = idx === stepIndex;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && !done && 'border-primary text-primary',
                  !done && !active && 'border-border text-muted-foreground'
                )}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-semibold">{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Content area ------------------------------------------------------ */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {currentStep === 'Layout' && (
            <LayoutStep
              key="layout"
              settings={settings}
              activePage={layoutPage}
              onPageChange={setLayoutPage}
              onReorder={handleModuleReorder}
              onToggle={handleModuleToggle}
            />
          )}
          {currentStep === 'Tabs' && (
            <TabsStep
              key="tabs"
              settings={settings}
              onToggle={handleNavToggle}
              onReorder={handleNavReorder}
            />
          )}
          {currentStep === 'Style' && (
            <StyleStep
              key="style"
              settings={settings}
              onChange={handleStyleChange}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom-bar preview + nav buttons --------------------------------- */}
      <footer className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
        {/* Mini preview of bottom nav tabs */}
        <div className="flex items-center justify-center gap-4">
          {settings.navTabs.map((tab) => {
            const Icon = NAV_ICONS[tab];
            return (
              <div key={tab} className="flex flex-col items-center gap-0.5">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{NAV_LABELS[tab]}</span>
              </div>
            );
          })}
        </div>

        {/* Step navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={goBack}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          {isLast ? (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveSettings.isPending}
              className="gap-1"
            >
              <Save className="h-4 w-4" /> Save
            </Button>
          ) : (
            <Button size="sm" onClick={goNext} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </motion.div>
  );
});

/* ==========================================================================
   Step Components
========================================================================== */
interface LayoutStepProps {
  settings: UISettings;
  activePage: keyof PageLayout;
  onPageChange: (page: keyof PageLayout) => void;
  onReorder: (page: keyof PageLayout, modules: LayoutModule[]) => void;
  onToggle: (page: keyof PageLayout, id: string) => void;
}

const LayoutStep = memo(function LayoutStep({
  settings,
  activePage,
  onPageChange,
  onReorder,
  onToggle,
}: LayoutStepProps) {
  const pages: (keyof PageLayout)[] = ['home', 'explore', 'messages', 'profile'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-4 max-w-lg mx-auto"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layout className="h-5 w-5 text-primary" /> Reorder Sections
          </CardTitle>
          <CardDescription className="text-xs">
            Drag to reorder, toggle to show/hide sections on each page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Page picker */}
          <div className="flex gap-2 flex-wrap">
            {pages.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={activePage === p ? 'default' : 'outline'}
                className="capitalize"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ))}
          </div>

          {/* Modules list */}
          <Reorder.Group
            axis="y"
            values={settings.layouts[activePage]}
            onReorder={(newOrder) => onReorder(activePage, newOrder)}
            className="space-y-2"
          >
            {settings.layouts[activePage].map((mod) => (
              <Reorder.Item
                key={mod.id}
                value={mod}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-colors',
                  mod.visible
                    ? 'bg-card border-border'
                    : 'bg-muted/50 border-muted opacity-60'
                )}
              >
                <Grip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 font-medium text-sm">{mod.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onToggle(activePage, mod.id)}
                >
                  {mod.visible ? (
                    <Eye className="h-4 w-4 text-primary" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </CardContent>
      </Card>
    </motion.div>
  );
});

/* -------------------------------------------------------------------------- */
interface TabsStepProps {
  settings: UISettings;
  onToggle: (tab: NavTab) => void;
  onReorder: (tabs: NavTab[]) => void;
}

const TabsStep = memo(function TabsStep({
  settings,
  onToggle,
  onReorder,
}: TabsStepProps) {
  const allTabs: NavTab[] = ['home', 'explore', 'upload', 'messages', 'profile'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-4 max-w-lg mx-auto"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Navigation className="h-5 w-5 text-primary" /> Bottom Tabs
          </CardTitle>
          <CardDescription className="text-xs">
            Pick which tabs appear in the bottom bar. Drag to reorder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggles */}
          <div className="space-y-2">
            {allTabs.map((tab) => {
              const Icon = NAV_ICONS[tab];
              const active = settings.navTabs.includes(tab);
              const isHome = tab === 'home';
              return (
                <div
                  key={tab}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    active ? 'bg-card border-border' : 'bg-muted/50 border-muted'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        active ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span className="font-medium text-sm">{NAV_LABELS[tab]}</span>
                    {isHome && (
                      <span className="text-[10px] text-muted-foreground">(required)</span>
                    )}
                  </div>
                  <Switch
                    checked={active}
                    onCheckedChange={() => onToggle(tab)}
                    disabled={isHome}
                  />
                </div>
              );
            })}
          </div>

          {/* Reorder */}
          <div className="pt-2 border-t border-border">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Drag to reorder
            </Label>
            <Reorder.Group
              axis="x"
              values={settings.navTabs}
              onReorder={onReorder}
              className="flex gap-2 flex-wrap"
            >
              {settings.navTabs.map((tab) => {
                const Icon = NAV_ICONS[tab];
                return (
                  <Reorder.Item
                    key={tab}
                    value={tab}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 cursor-grab active:cursor-grabbing"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs">{NAV_LABELS[tab]}</span>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

/* -------------------------------------------------------------------------- */
interface StyleStepProps {
  settings: UISettings;
  onChange: <K extends keyof UISettings>(key: K, val: UISettings[K]) => void;
}

const StyleStep = memo(function StyleStep({
  settings,
  onChange,
}: StyleStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="space-y-4 max-w-lg mx-auto"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-5 w-5 text-primary" /> Style Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Fine-tune visual preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Font Scale */}
          <StylePicker
            label="Font Size"
            options={['small', 'medium', 'large', 'xlarge']}
            current={settings.fontScale}
            onSelect={(v) => onChange('fontScale', v as UISettings['fontScale'])}
          />

          {/* Contrast */}
          <StylePicker
            label="Contrast"
            options={['low', 'medium', 'high']}
            current={settings.contrastLevel}
            onSelect={(v) => onChange('contrastLevel', v as UISettings['contrastLevel'])}
          />

          {/* Button Style */}
          <StylePicker
            label="Button Style"
            options={['glass', 'solid', 'outline']}
            current={settings.buttonStyle}
            onSelect={(v) => onChange('buttonStyle', v as UISettings['buttonStyle'])}
          />

          {/* Motion Intensity */}
          <StylePicker
            label="Motion Intensity"
            options={['low', 'medium', 'high']}
            current={settings.motionIntensity}
            onSelect={(v) => onChange('motionIntensity', v as UISettings['motionIntensity'])}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
});

/* Small helper for the style pickers */
function StylePicker({
  label,
  options,
  current,
  onSelect,
}: {
  label: string;
  options: string[];
  current: string;
  onSelect: (val: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-4 gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            size="sm"
            variant={current === opt ? 'default' : 'outline'}
            className="capitalize text-xs"
            onClick={() => onSelect(opt)}
          >
            {opt === 'xlarge' ? 'XL' : opt}
          </Button>
        ))}
      </div>
    </div>
  );
}
