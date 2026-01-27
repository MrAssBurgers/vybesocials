import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { 
  Grip, Eye, EyeOff, Undo2, Redo2, RotateCcw, 
  Save, X, Check, Layout, Navigation, Palette, 
  Sparkles, Home, Compass, Upload, MessageCircle, User,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  useUISettings, 
  useSaveUISettings, 
  useResetUISettings,
  DEFAULT_UI_SETTINGS,
  LayoutModule,
  NavTab,
  UISettings,
  PageLayout
} from '@/hooks/useUISettings';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

interface HistoryEntry {
  settings: UISettings;
  timestamp: number;
}

export const UIBuilder = memo(function UIBuilder({ onClose }: { onClose: () => void }) {
  const { data: currentSettings } = useUISettings();
  const saveSettings = useSaveUISettings();
  const resetSettings = useResetUISettings();
  const { triggerTransition } = useThemeTransition();

  // Working state
  const [settings, setSettings] = useState<UISettings>(
    currentSettings || DEFAULT_UI_SETTINGS
  );
  
  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([
    { settings: currentSettings || DEFAULT_UI_SETTINGS, timestamp: Date.now() }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // UI state
  const [activeTab, setActiveTab] = useState('layout');
  const [activeLayoutPage, setActiveLayoutPage] = useState<keyof PageLayout>('home');
  const [isPreview, setIsPreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Push to history
  const pushHistory = useCallback((newSettings: UISettings) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ settings: newSettings, timestamp: Date.now() });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSettings(newSettings);
    setHasChanges(true);
  }, [history, historyIndex]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSettings(history[historyIndex - 1].settings);
    }
  }, [history, historyIndex]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSettings(history[historyIndex + 1].settings);
    }
  }, [history, historyIndex]);

  // Reset to default
  const handleReset = useCallback(() => {
    triggerTransition('280 70% 50%', '330 80% 60%', () => {
      pushHistory(DEFAULT_UI_SETTINGS);
      toast.success('Reset to default layout');
    });
  }, [pushHistory, triggerTransition]);

  // Save settings
  const handleSave = useCallback(async () => {
    triggerTransition('280 70% 50%', '330 80% 60%', async () => {
      await saveSettings.mutateAsync(settings);
      setHasChanges(false);
      toast.success('Layout saved!');
      onClose();
    });
  }, [settings, saveSettings, triggerTransition, onClose]);

  // Update layout modules
  const handleModuleReorder = useCallback((page: keyof PageLayout, newOrder: LayoutModule[]) => {
    const updated = newOrder.map((m, i) => ({ ...m, order: i }));
    pushHistory({
      ...settings,
      layouts: {
        ...settings.layouts,
        [page]: updated,
      },
    });
  }, [settings, pushHistory]);

  // Toggle module visibility
  const handleModuleToggle = useCallback((page: keyof PageLayout, moduleId: string) => {
    const modules = settings.layouts[page].map(m => 
      m.id === moduleId ? { ...m, visible: !m.visible } : m
    );
    
    // Ensure at least one module is visible
    if (!modules.some(m => m.visible)) {
      toast.error('At least one section must be visible');
      return;
    }
    
    pushHistory({
      ...settings,
      layouts: {
        ...settings.layouts,
        [page]: modules,
      },
    });
  }, [settings, pushHistory]);

  // Update nav tabs
  const handleNavTabToggle = useCallback((tab: NavTab) => {
    if (tab === 'home') {
      toast.error('Home tab cannot be hidden');
      return;
    }
    
    let newTabs: NavTab[];
    if (settings.navTabs.includes(tab)) {
      newTabs = settings.navTabs.filter(t => t !== tab);
      if (newTabs.length < 3) {
        toast.error('At least 3 tabs must be visible');
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
  }, [settings, pushHistory]);

  // Reorder nav tabs
  const handleNavReorder = useCallback((newTabs: NavTab[]) => {
    // Ensure home is always first
    if (newTabs[0] !== 'home') {
      const homeIndex = newTabs.indexOf('home');
      if (homeIndex > 0) {
        newTabs = ['home', ...newTabs.filter(t => t !== 'home')];
      }
    }
    
    pushHistory({
      ...settings,
      navTabs: newTabs,
      navOrder: newTabs.map((_, i) => i),
    });
  }, [settings, pushHistory]);

  // Update style settings
  const handleStyleChange = useCallback((key: keyof UISettings, value: any) => {
    pushHistory({
      ...settings,
      [key]: value,
    });
  }, [settings, pushHistory]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Design Your VYBE</h1>
            <p className="text-xs text-muted-foreground">Customize your app layout</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleUndo}
            disabled={!canUndo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRedo}
            disabled={!canRedo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          
          {/* Reset */}
          <Button variant="ghost" size="icon" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          {/* Preview */}
          <Button 
            variant={isPreview ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setIsPreview(!isPreview)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          
          {/* Save */}
          <Button 
            size="sm" 
            onClick={handleSave}
            disabled={!hasChanges || saveSettings.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="layout">
              <Layout className="h-4 w-4 mr-2" />
              Layout
            </TabsTrigger>
            <TabsTrigger value="navigation">
              <Navigation className="h-4 w-4 mr-2" />
              Navigation
            </TabsTrigger>
            <TabsTrigger value="style">
              <Palette className="h-4 w-4 mr-2" />
              Style
            </TabsTrigger>
          </TabsList>

          {/* Layout Tab */}
          <TabsContent value="layout" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layout className="h-5 w-5 text-primary" />
                  Page Sections
                </CardTitle>
                <CardDescription>
                  Drag to reorder, toggle to show/hide sections
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Page selector */}
                <div className="flex gap-2 mb-4">
                  {(['home', 'explore', 'messages', 'profile'] as const).map(page => (
                    <Button
                      key={page}
                      variant={activeLayoutPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActiveLayoutPage(page)}
                      className="capitalize"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                {/* Module list */}
                <Reorder.Group
                  axis="y"
                  values={settings.layouts[activeLayoutPage]}
                  onReorder={(newOrder) => handleModuleReorder(activeLayoutPage, newOrder)}
                  className="space-y-2"
                >
                  {settings.layouts[activeLayoutPage].map(module => (
                    <Reorder.Item
                      key={module.id}
                      value={module}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-colors",
                        module.visible 
                          ? "bg-card border-border" 
                          : "bg-muted/50 border-muted opacity-60"
                      )}
                    >
                      <Grip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 font-medium">{module.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleModuleToggle(activeLayoutPage, module.id)}
                      >
                        {module.visible ? (
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
          </TabsContent>

          {/* Navigation Tab */}
          <TabsContent value="navigation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="h-5 w-5 text-primary" />
                  Bottom Navigation
                </CardTitle>
                <CardDescription>
                  Choose which tabs appear and their order
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tab toggles */}
                <div className="space-y-3">
                  {(['home', 'explore', 'upload', 'messages', 'profile'] as NavTab[]).map(tab => {
                    const Icon = NAV_ICONS[tab];
                    const isActive = settings.navTabs.includes(tab);
                    const isHome = tab === 'home';
                    
                    return (
                      <div 
                        key={tab} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border",
                          isActive ? "bg-card border-border" : "bg-muted/50 border-muted"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={cn(
                            "h-5 w-5",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )} />
                          <span className="font-medium">{NAV_LABELS[tab]}</span>
                          {isHome && (
                            <span className="text-xs text-muted-foreground">(Required)</span>
                          )}
                        </div>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => handleNavTabToggle(tab)}
                          disabled={isHome}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Tab order */}
                <div className="pt-4 border-t">
                  <Label className="text-sm font-medium mb-3 block">Tab Order</Label>
                  <Reorder.Group
                    axis="x"
                    values={settings.navTabs}
                    onReorder={handleNavReorder}
                    className="flex gap-2 flex-wrap"
                  >
                    {settings.navTabs.map(tab => {
                      const Icon = NAV_ICONS[tab];
                      return (
                        <Reorder.Item
                          key={tab}
                          value={tab}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 cursor-grab active:cursor-grabbing"
                        >
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="text-sm">{NAV_LABELS[tab]}</span>
                        </Reorder.Item>
                      );
                    })}
                  </Reorder.Group>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Style Tab */}
          <TabsContent value="style" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Style Settings
                </CardTitle>
                <CardDescription>
                  Fine-tune your visual preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Font Scale */}
                <div className="space-y-3">
                  <Label>Font Size</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['small', 'medium', 'large', 'xlarge'] as const).map(size => (
                      <Button
                        key={size}
                        variant={settings.fontScale === size ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleStyleChange('fontScale', size)}
                        className="capitalize"
                      >
                        {size === 'xlarge' ? 'XL' : size.charAt(0).toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Contrast Level */}
                <div className="space-y-3">
                  <Label>Contrast</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map(level => (
                      <Button
                        key={level}
                        variant={settings.contrastLevel === level ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleStyleChange('contrastLevel', level)}
                        className="capitalize"
                      >
                        {level}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Button Style */}
                <div className="space-y-3">
                  <Label>Button Style</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['glass', 'solid', 'outline'] as const).map(style => (
                      <Button
                        key={style}
                        variant={settings.buttonStyle === style ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleStyleChange('buttonStyle', style)}
                        className="capitalize"
                      >
                        {style}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Motion Intensity */}
                <div className="space-y-3">
                  <Label>Animation Intensity</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map(intensity => (
                      <Button
                        key={intensity}
                        variant={settings.motionIntensity === intensity ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleStyleChange('motionIntensity', intensity)}
                        className="capitalize"
                      >
                        {intensity}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Warning for invalid layouts */}
            <Card className="border-accent/50 bg-accent/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-accent">Safe Mode</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    If your layout breaks, VYBE will automatically restore defaults on next launch.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
});
