import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Palette, 
  Check, 
  RefreshCw, 
  Wand2, 
  Sun, 
  Moon,
  Zap,
  RotateCcw,
  Share2,
  ChevronRight,
  Image,
  Layers,
  Timer,
  Pencil
} from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  useUserTheme, 
  useSaveTheme, 
  useResetTheme, 
  useGenerateTheme,
  applyThemeTokens,
  applyBackgroundImage,
  THEME_PRESETS,
  ThemeTokens,
} from '@/hooks/useCustomTheme';
import { useShareTheme } from '@/hooks/useSharedThemes';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { BackgroundCustomizer } from './BackgroundCustomizer';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Theme presets with metadata
const PRESET_INFO: Record<string, { name: string; description: string; icon: string; colors: [string, string] }> = {
  classic: { name: 'Classic', description: 'Pink & cyan neon', icon: '💜', colors: ['330 100% 60%', '185 100% 50%'] },
  midnight: { name: 'Midnight', description: 'Deep ocean blues', icon: '🌙', colors: ['220 90% 56%', '200 100% 62%'] },
  neon: { name: 'Neon', description: 'Electric glow', icon: '⚡', colors: ['330 100% 60%', '160 100% 50%'] },
  soft: { name: 'Soft', description: 'Warm pastels', icon: '🌸', colors: ['340 65% 55%', '160 50% 50%'] },
  cyberpunk: { name: 'Cyberpunk', description: 'Retro future', icon: '🤖', colors: ['55 100% 50%', '180 100% 50%'] },
  minimal: { name: 'Minimal', description: 'Clean & simple', icon: '⬛', colors: ['0 0% 15%', '0 0% 40%'] },
};

const ANIMATION_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
  { value: 'slow', label: 'Slow' },
  { value: 'instant', label: 'None' },
] as const;

const BORDER_RADIUS_OPTIONS = [
  { value: 'small', label: 'Sharp' },
  { value: 'medium', label: 'Rounded' },
  { value: 'large', label: 'Pill' },
] as const;

export function ThemeCustomizer() {
  const { data: userTheme, isLoading } = useUserTheme();
  const saveTheme = useSaveTheme();
  const resetTheme = useResetTheme();
  const generateTheme = useGenerateTheme();
  const shareTheme = useShareTheme();
  const { triggerTransition } = useThemeTransition();

  // State
  const [selectedPreset, setSelectedPreset] = useState('classic');
  const [currentTheme, setCurrentTheme] = useState<ThemeTokens | null>(null);
  const [themeName, setThemeName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareDescription, setShareDescription] = useState('');
  
  // Theme settings
  const [animationSpeed, setAnimationSpeed] = useState<'slow' | 'normal' | 'fast' | 'instant'>('normal');
  const [borderRadius, setBorderRadius] = useState<'small' | 'medium' | 'large'>('medium');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(30);
  const [backgroundBlur, setBackgroundBlur] = useState(0);

  // Load saved theme
  useEffect(() => {
    if (userTheme?.theme_tokens && userTheme.is_active) {
      const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
      setCurrentTheme(tokens);
      setThemeName(userTheme.theme_name || '');
      setSelectedPreset(userTheme.base_preset || 'classic');
      setAnimationSpeed(tokens.animationSpeed || 'normal');
      setBorderRadius(tokens.borderRadius || 'medium');
      setBackgroundImage(tokens.backgroundImage || null);
      setBackgroundOpacity(tokens.backgroundOpacity ?? 30);
      setBackgroundBlur(tokens.backgroundBlur ?? 0);
    }
  }, [userTheme]);

  // Build current theme with all settings
  const buildTheme = useCallback((): ThemeTokens => {
    const base = currentTheme || THEME_PRESETS[selectedPreset];
    return {
      ...base,
      animationSpeed,
      borderRadius,
      backgroundImage: backgroundImage || undefined,
      backgroundOpacity,
      backgroundBlur,
    };
  }, [currentTheme, selectedPreset, animationSpeed, borderRadius, backgroundImage, backgroundOpacity, backgroundBlur]);

  // Apply theme changes
  const applyChanges = useCallback(() => {
    const theme = buildTheme();
    applyThemeTokens(theme);
    setHasChanges(true);
  }, [buildTheme]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetKey: string) => {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) return;

    const [primary, accent] = PRESET_INFO[presetKey]?.colors || ['330 100% 60%', '185 100% 50%'];
    
    triggerTransition(primary, accent, () => {
      setSelectedPreset(presetKey);
      setCurrentTheme({ ...preset, animationSpeed, borderRadius, backgroundImage: backgroundImage || undefined, backgroundOpacity, backgroundBlur });
      setThemeName(PRESET_INFO[presetKey]?.name || presetKey);
      applyThemeTokens({ ...preset, animationSpeed, borderRadius, backgroundImage: backgroundImage || undefined, backgroundOpacity, backgroundBlur });
      setHasChanges(true);
    });
  }, [animationSpeed, borderRadius, backgroundImage, backgroundOpacity, backgroundBlur, triggerTransition]);

  // Handle AI generation
  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    try {
      const theme = await generateTheme.mutateAsync({
        prompt: aiPrompt,
        basePreset: selectedPreset,
      });

      if (theme && 'colorPrimary' in theme) {
        const themeWithSettings: ThemeTokens = {
          ...(theme as ThemeTokens),
          animationSpeed,
          borderRadius,
          backgroundImage: backgroundImage || undefined,
          backgroundOpacity,
          backgroundBlur,
        };

        const primary = themeWithSettings.colorPrimary || '330 100% 60%';
        const accent = themeWithSettings.colorAccent || '185 100% 50%';

        triggerTransition(primary, accent, () => {
          setCurrentTheme(themeWithSettings);
          setThemeName((theme as any).themeName || 'Custom Theme');
          applyThemeTokens(themeWithSettings);
          setHasChanges(true);
        });
      }
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [aiPrompt, selectedPreset, animationSpeed, borderRadius, backgroundImage, backgroundOpacity, backgroundBlur, generateTheme, triggerTransition]);

  // Save theme
  const handleSave = useCallback(async () => {
    const theme = buildTheme();
    
    await saveTheme.mutateAsync({
      themeTokens: theme,
      themeName: themeName || 'My Theme',
      basePreset: selectedPreset,
    });

    setHasChanges(false);
  }, [buildTheme, themeName, selectedPreset, saveTheme]);

  // Reset to default
  const handleReset = useCallback(async () => {
    await resetTheme.mutateAsync();
    setCurrentTheme(null);
    setThemeName('');
    setSelectedPreset('classic');
    setAnimationSpeed('normal');
    setBorderRadius('medium');
    setBackgroundImage(null);
    setBackgroundOpacity(30);
    setBackgroundBlur(0);
    setHasChanges(false);
  }, [resetTheme]);

  // Update settings and apply
  const updateSetting = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setCurrentTheme(prev => {
      const base = prev || THEME_PRESETS[selectedPreset];
      return { ...base, [key]: value };
    });
    setHasChanges(true);
    
    // Apply immediately
    setTimeout(() => {
      const theme = buildTheme();
      applyThemeTokens({ ...theme, [key]: value });
    }, 0);
  }, [selectedPreset, buildTheme]);

  return (
    <div className="space-y-6">
      {/* Header with Save Status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            <Palette className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
            <span>Theme</span>
          </h3>
          <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Customize your VYBE</p>
        </div>
        
        <AnimatePresence mode="wait">
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex gap-2"
            >
              <Button size="sm" variant="outline" onClick={handleReset} disabled={resetTheme.isPending}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveTheme.isPending}>
                {saveTheme.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Theme Generator */}
      <div className="liquid-glass-card p-4 space-y-3 bg-card/60 border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
          <Wand2 className="h-4 w-4 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          <span>AI Theme Designer</span>
        </div>
        
        <div className="relative">
          <Textarea
            placeholder="Describe your vibe... e.g., 'Ocean sunset with warm oranges' or 'Cyberpunk neon city'"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            className="min-h-[80px] pr-20 resize-none"
            disabled={isGenerating}
          />
          <Button
            size="sm"
            className="absolute bottom-2 right-2"
            onClick={handleGenerate}
            disabled={!aiPrompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <VybeMiniIcon size={16} showSparkles />
            )}
          </Button>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Quick Presets</Label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PRESET_INFO).map(([key, info]) => {
            const preset = THEME_PRESETS[key];
            const isSelected = selectedPreset === key;
            
            return (
              <button
                key={key}
                onClick={() => handlePresetSelect(key)}
                className={cn(
                  "relative p-3 rounded-xl border transition-all duration-200",
                  "active:scale-[0.97]",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/50"
                    : "border-border hover:border-primary/40"
                )}
              >
                <div 
                  className="w-full h-8 rounded-lg mb-2"
                  style={{ 
                    background: `linear-gradient(135deg, hsl(${info.colors[0]}), hsl(${info.colors[1]}))`,
                  }}
                />
                <p className="text-xs font-medium truncate">{info.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{info.description}</p>
                
                {preset.mode === 'dark' ? (
                  <Moon className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
                ) : (
                  <Sun className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Background Customization */}
      <Sheet>
        <SheetTrigger asChild>
          <button className="w-full liquid-glass-card p-4 flex items-center justify-between hover:bg-accent/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Background Image</p>
                <p className="text-xs text-muted-foreground">
                  {backgroundImage ? 'Custom background set' : 'Upload or generate with AI'}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col">
          <SheetHeader className="pb-4 flex-shrink-0">
            <SheetTitle>Background Image</SheetTitle>
            <SheetDescription>Upload your own image or generate one with AI</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch pb-safe pb-12">
            <BackgroundCustomizer
              currentBackground={backgroundImage || undefined}
              backgroundOpacity={backgroundOpacity}
              backgroundBlur={backgroundBlur}
              onBackgroundChange={(url) => {
                // ONLY set background - NEVER touch theme colors
                setBackgroundImage(url);
                // Use dedicated background function, NOT applyThemeTokens
                applyBackgroundImage(url, backgroundOpacity, backgroundBlur);
                // Update local state for tracking
                setCurrentTheme(prev => ({ ...(prev || THEME_PRESETS[selectedPreset]), backgroundImage: url || undefined }));
                setHasChanges(true);
              }}
              onOpacityChange={(opacity) => {
                setBackgroundOpacity(opacity);
                // Only update background opacity, not theme tokens
                applyBackgroundImage(backgroundImage, opacity, backgroundBlur);
                setHasChanges(true);
              }}
              onBlurChange={(blur) => {
                setBackgroundBlur(blur);
                // Only update background blur, not theme tokens
                applyBackgroundImage(backgroundImage, backgroundOpacity, blur);
                setHasChanges(true);
              }}
              onColorsExtracted={(colors) => {
                // User chose to match colors - apply extracted colors to theme
                const newTheme: ThemeTokens = {
                  ...(currentTheme || THEME_PRESETS[selectedPreset]),
                  colorPrimary: colors.primary,
                  colorAccent: colors.accent,
                  colorSecondary: colors.secondary,
                  bgMain: colors.background,
                };
                setCurrentTheme(newTheme);
                applyThemeTokens(newTheme); // This won't touch background since preserveBackground is true by default
                setHasChanges(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Settings */}
      <div className="grid grid-cols-2 gap-4">
        {/* Animation Speed */}
        <div className="space-y-2">
          <Label className="text-xs text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] flex items-center gap-1">
            <Timer className="h-3 w-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
            <span>Animation</span>
          </Label>
          <div className="grid grid-cols-2 gap-1">
            {ANIMATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setAnimationSpeed(opt.value);
                  updateSetting('animationSpeed', opt.value);
                }}
                className={cn(
                  "py-1.5 px-2 text-xs rounded-lg border transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]",
                  animationSpeed === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card/60 hover:border-primary/40 text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="space-y-2">
          <Label className="text-xs text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] flex items-center gap-1">
            <Layers className="h-3 w-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
            <span>Corners</span>
          </Label>
          <div className="grid grid-cols-3 gap-1">
            {BORDER_RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setBorderRadius(opt.value);
                  updateSetting('borderRadius', opt.value);
                }}
                className={cn(
                  "py-1.5 px-2 text-xs border transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]",
                  opt.value === 'small' && 'rounded-sm',
                  opt.value === 'medium' && 'rounded-lg',
                  opt.value === 'large' && 'rounded-xl',
                  borderRadius === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card/60 hover:border-primary/40 text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Theme Name (for saving) */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Theme Name</Label>
              <Input
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="My Custom Theme"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Button */}
      {currentTheme && (
        <Button
          variant="ghost"
          className="w-full bg-card/60 border border-border hover:bg-accent text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
          onClick={() => setShowShareDialog(true)}
        >
          <Share2 className="h-4 w-4 mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Share with Community</span>
        </Button>
      )}

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Your Theme</DialogTitle>
            <DialogDescription>Share your custom theme with the VYBE community</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {currentTheme && (
              <div 
                className="w-full h-20 rounded-xl"
                style={{ 
                  background: `linear-gradient(135deg, hsl(${currentTheme.colorPrimary}), hsl(${currentTheme.colorAccent}))` 
                }}
              />
            )}
            <div className="space-y-2">
              <Label>Theme Name</Label>
              <Input
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="Give your theme a name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={shareDescription}
                onChange={(e) => setShareDescription(e.target.value)}
                placeholder="Describe your theme..."
              />
            </div>
            <Button
              className="w-full"
              onClick={async () => {
                if (!themeName.trim() || !currentTheme) return;
                await shareTheme.mutateAsync({
                  themeName,
                  themeTokens: currentTheme,
                  description: shareDescription || undefined,
                });
                setShowShareDialog(false);
                setShareDescription('');
              }}
              disabled={shareTheme.isPending || !themeName.trim()}
            >
              {shareTheme.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              Share Theme
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Option */}
      <div className="pt-4 border-t border-border">
        <Button
          variant="ghost"
          className="w-full bg-card/60 border border-border text-foreground hover:text-destructive hover:bg-destructive/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
          onClick={handleReset}
          disabled={resetTheme.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Reset to Default</span>
        </Button>
      </div>
    </div>
  );
}
