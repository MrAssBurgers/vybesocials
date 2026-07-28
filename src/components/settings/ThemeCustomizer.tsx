import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { 
  useUserTheme, 
  useSaveTheme, 
  useResetTheme, 
  useGenerateTheme,
  applyThemeTokens,
  persistEquippedUserTheme,
  setThemePreviewLock,
  THEME_PRESETS,
  ThemeTokens,
} from '@/hooks/useCustomTheme';
import { readLastGeneratedTheme, getCustomThemePreset, persistLastGeneratedTheme } from '@/lib/theme/lastGeneratedTheme';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useAppBackgroundSafe } from '@/components/layout/AppBackground';
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
  custom: { name: 'Custom', description: 'Your latest AI theme', icon: '✨', colors: ['330 100% 60%', '185 100% 50%'] },
};

function normalizeBasePreset(preset?: string | null): string {
  if (preset === 'minimal') return 'custom';
  return preset || 'classic';
}

function resolvePresetTokens(presetKey: string, userId?: string | null): ThemeTokens | null {
  if (presetKey === 'custom') {
    return readLastGeneratedTheme(userId) ?? getCustomThemePreset(THEME_PRESETS.classic);
  }
  return THEME_PRESETS[presetKey] ?? null;
}

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
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const saveTheme = useSaveTheme();
  const resetTheme = useResetTheme();
  const generateTheme = useGenerateTheme();
  const shareTheme = useShareTheme();
  const { triggerTransition } = useThemeTransition();
  const { setTheme: setGlobalTheme } = useTheme();

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
  const [customPresetTokens, setCustomPresetTokens] = useState<ThemeTokens | null>(() =>
    readLastGeneratedTheme(),
  );
  const editingRef = useRef(false);

  // Get background state from AppBackground (single source of truth)
  const appBackground = useAppBackgroundSafe();
  const backgroundImage = appBackground?.background.imageUrl || null;

  // Load saved theme — never clobber an in-progress local edit from a stale refetch.
  useEffect(() => {
    if (editingRef.current || hasChanges) return;
    if (userTheme?.theme_tokens && userTheme.is_active) {
      const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
      const preset = normalizeBasePreset(userTheme.base_preset);
      setCurrentTheme(tokens);
      setThemeName(userTheme.theme_name || '');
      setSelectedPreset(preset);
      setAnimationSpeed(tokens.animationSpeed || 'normal');
      setBorderRadius(tokens.borderRadius || 'medium');
      if (preset === 'custom') {
        persistLastGeneratedTheme(tokens, profile?.id);
        setCustomPresetTokens(tokens);
      }
    }
    if (profile?.id) {
      const lastCustom = readLastGeneratedTheme(profile.id);
      if (lastCustom) setCustomPresetTokens(lastCustom);
    }
  }, [userTheme, profile?.id, hasChanges]);

  const commitThemeSelection = useCallback((
    theme: ThemeTokens,
    preset: string,
    name?: string,
    options?: { toast?: boolean },
  ) => {
    const resolvedName =
      name || theme.themeName || themeName || PRESET_INFO[preset]?.name || 'My Theme';
    const named: ThemeTokens = {
      ...theme,
      themeName: resolvedName,
    };
    persistEquippedUserTheme(named, {
      queryClient,
      userId: user?.id,
      basePreset: preset,
      themeName: resolvedName,
      silent: true,
    });
    editingRef.current = false;
    setHasChanges(false);
    if (options?.toast !== false) {
      toast.success(`${resolvedName} equipped`);
    }
  }, [queryClient, user?.id, themeName]);

  // Build current theme with all settings (background is managed by AppBackground, not here)
  const buildTheme = useCallback((): ThemeTokens => {
    const base = currentTheme || resolvePresetTokens(selectedPreset, profile?.id) || THEME_PRESETS.classic;
    return {
      ...base,
      animationSpeed,
      borderRadius,
    };
  }, [currentTheme, selectedPreset, animationSpeed, borderRadius, profile?.id]);

  // Apply theme changes
  const applyChanges = useCallback(() => {
    const theme = buildTheme();
    applyThemeTokens(theme);
    setHasChanges(true);
  }, [buildTheme]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetKey: string) => {
    if (presetKey === 'custom' && !readLastGeneratedTheme(profile?.id)?.colorPrimary) {
      toast.error('Generate a theme first — Custom updates after each AI generation');
      return;
    }

    const preset = resolvePresetTokens(presetKey, profile?.id);
    if (!preset) return;

    const [primary, accent] =
      presetKey === 'custom'
        ? [preset.colorPrimary, preset.colorAccent]
        : (PRESET_INFO[presetKey]?.colors || ['330 100% 60%', '185 100% 50%']);

    triggerTransition(primary, accent, () => {
      const themeWithSettings = { ...preset, animationSpeed, borderRadius };
      const resolvedName =
        presetKey === 'custom'
          ? (preset.themeName || 'Custom')
          : (PRESET_INFO[presetKey]?.name || presetKey);

      const targetMode = themeWithSettings.mode === 'light' ? 'light' : 'dark';
      setGlobalTheme(targetMode);

      setSelectedPreset(presetKey);
      setCurrentTheme(themeWithSettings);
      setThemeName(resolvedName);
      applyThemeTokens(themeWithSettings);
      commitThemeSelection(themeWithSettings, presetKey, resolvedName);
    });
  }, [animationSpeed, borderRadius, triggerTransition, profile?.id, commitThemeSelection, setGlobalTheme]);

  // Handle AI generation — empty prompt uses profile + Vybe DNA via useGenerateTheme.
  // Partial updates stream CSS vars live as NDJSON patches arrive.
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setThemePreviewLock(true);
    try {
      const theme = await generateTheme.mutateAsync({
        prompt: aiPrompt.trim(),
        typedPrompt: aiPrompt.trim(),
        basePreset: selectedPreset,
        onPatch: (partial) => {
          const live: ThemeTokens = {
            ...partial,
            animationSpeed,
            borderRadius,
          };
          setCurrentTheme(live);
          if (partial.themeName) setThemeName(partial.themeName);
          applyThemeTokens(live);
        },
      });

      if (theme && 'colorPrimary' in theme) {
        const themeWithSettings: ThemeTokens = {
          ...(theme as ThemeTokens),
          animationSpeed,
          borderRadius,
        };

        const primary = themeWithSettings.colorPrimary || '330 100% 60%';
        const accent = themeWithSettings.colorAccent || '185 100% 50%';

        triggerTransition(primary, accent, () => {
          const resolvedName = (theme as any).themeName || 'Custom Theme';
          const targetMode = themeWithSettings.mode === 'light' ? 'light' : 'dark';
          setGlobalTheme(targetMode);
          setCurrentTheme(themeWithSettings);
          setThemeName(resolvedName);
          setSelectedPreset('custom');
          persistLastGeneratedTheme(themeWithSettings, profile?.id);
          setCustomPresetTokens(themeWithSettings);
          applyThemeTokens(themeWithSettings);
          commitThemeSelection(themeWithSettings, 'custom', resolvedName);
        });
      }
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setThemePreviewLock(false);
      setIsGenerating(false);
    }
  }, [aiPrompt, selectedPreset, animationSpeed, borderRadius, generateTheme, triggerTransition, profile?.id, commitThemeSelection, setGlobalTheme]);

  // Save theme (name + DB row) — tokens already equipped via commitThemeSelection
  const handleSave = useCallback(async () => {
    const theme = buildTheme();
    const name = themeName || theme.themeName || 'My Theme';
    const preset = selectedPreset;

    await saveTheme.mutateAsync({
      themeTokens: theme,
      themeName: name,
      basePreset: preset,
    });

    editingRef.current = false;
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
    // Clear background via AppBackground
    appBackground?.setBackgroundImage(null);
    editingRef.current = false;
    setHasChanges(false);
  }, [resetTheme, appBackground]);

  // Update settings and apply
  const updateSetting = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    const base = currentTheme || resolvePresetTokens(selectedPreset, profile?.id) || THEME_PRESETS.classic;
    const theme = { ...base, [key]: value, animationSpeed, borderRadius };
    setCurrentTheme({ ...base, [key]: value });
    applyThemeTokens(theme);
    commitThemeSelection(theme, selectedPreset, theme.themeName, { toast: false });
  }, [selectedPreset, currentTheme, animationSpeed, borderRadius, profile?.id, commitThemeSelection]);

  return (
    <div className="space-y-5">
      {/* Header with Save Status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Palette className="h-4 w-4 text-primary" />
            <span>Customize</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Tune your VYBE</p>
        </div>

        <AnimatePresence mode="wait">
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex gap-2"
            >
              <Button size="sm" variant="ghost" onClick={handleReset} disabled={resetTheme.isPending} className="h-9 w-9 p-0 rounded-xl bg-card/60 backdrop-blur-xl border border-border/50">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveTheme.isPending} className="h-9 rounded-xl">
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
      <div className="liquid-glass-card p-4 space-y-3 rounded-2xl">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wand2 className="h-4 w-4 text-primary" />
          <span>AI Theme Designer</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Leave blank to generate from your profile, Vybe DNA, and interests — or describe a specific vibe.
        </p>

        <div className="relative">
          <Textarea
            placeholder="Optional: e.g. 'Ocean sunset with warm oranges' — or tap generate to use what VYBE knows about you"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            className="min-h-[80px] pr-14 resize-none rounded-xl bg-background/40 border-border/50"
            disabled={isGenerating}
          />
          <Button
            size="sm"
            className="absolute bottom-2 right-2 h-9 w-9 p-0 rounded-xl"
            onClick={handleGenerate}
            disabled={isGenerating}
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
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Presets</Label>
        <div className="grid grid-cols-3 gap-2.5">
          {Object.entries(PRESET_INFO).map(([key, info]) => {
            const preset =
              key === 'custom'
                ? (customPresetTokens ??
                  readLastGeneratedTheme(profile?.id) ??
                  getCustomThemePreset(THEME_PRESETS.classic))
                : (THEME_PRESETS[key] ?? THEME_PRESETS.classic);
            const displayInfo =
              key === 'custom' && customPresetTokens?.themeName
                ? { ...info, description: customPresetTokens.themeName }
                : info;
            const isSelected = selectedPreset === key;
            const swatchColors: [string, string] =
              key === 'custom'
                ? [preset.colorPrimary, preset.colorAccent]
                : info.colors;

            return (
              <button
                key={key}
                onClick={() => handlePresetSelect(key)}
                className={cn(
                  "relative p-3 rounded-2xl border transition-all duration-200 backdrop-blur-xl text-left",
                  "active:scale-[0.97]",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-md shadow-primary/10"
                    : "border-border/50 bg-card/40 hover:border-primary/40"
                )}
              >
                <div
                  className="w-full h-10 rounded-xl mb-2 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, hsl(${swatchColors[0]}), hsl(${swatchColors[1]}))`,
                  }}
                />
                <p className="text-xs font-semibold truncate">{displayInfo.name}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{displayInfo.description}</p>

                {preset.mode === 'dark' ? (
                  <Moon className="absolute top-2 right-2 h-3 w-3 text-muted-foreground/70" />
                ) : (
                  <Sun className="absolute top-2 right-2 h-3 w-3 text-muted-foreground/70" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Background Customization */}
      <Sheet>
        <SheetTrigger asChild>
          <button className="w-full liquid-glass-card p-4 rounded-2xl flex items-center justify-between hover:bg-accent/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-accent/25 flex items-center justify-center">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Background Image</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {backgroundImage ? 'Custom background set' : 'Upload or generate with AI'}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          <SheetHeader className="pb-4 flex-shrink-0 px-6 pt-6">
            <SheetTitle>Background Image</SheetTitle>
            <SheetDescription>Upload your own image or generate one with AI</SheetDescription>
          </SheetHeader>
          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
          >
            <BackgroundCustomizer
              currentBackground={backgroundImage || undefined}
              backgroundOpacity={appBackground?.background.opacity ? Math.round(appBackground.background.opacity * 100) : 85}
              backgroundBlur={appBackground?.background.blur ?? 0}
              onBackgroundChange={(url) => {
                // Delegate to AppBackground — single source of truth
                appBackground?.setBackgroundImage(url);
                setHasChanges(true);
              }}
              onOpacityChange={(opacity) => {
                appBackground?.setBackgroundOpacity(opacity / 100);
                setHasChanges(true);
              }}
              onBlurChange={(blur) => {
                appBackground?.setBackgroundBlur(blur);
                setHasChanges(true);
              }}
              onColorsExtracted={(colors) => {
                const newTheme: ThemeTokens = {
                  ...(currentTheme || resolvePresetTokens(selectedPreset, profile?.id) || THEME_PRESETS.classic),
                  colorPrimary: colors.primary,
                  colorAccent: colors.accent,
                  colorSecondary: colors.secondary,
                  bgMain: colors.background,
                  animationSpeed,
                  borderRadius,
                };
                setCurrentTheme(newTheme);
                applyThemeTokens(newTheme);
                commitThemeSelection(newTheme, selectedPreset);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Settings */}
      <div className="grid grid-cols-2 gap-3">
        {/* Animation Speed */}
        <div className="liquid-glass-card p-3 rounded-2xl space-y-2.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Timer className="h-3 w-3" />
            Animation
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            {ANIMATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setAnimationSpeed(opt.value);
                  updateSetting('animationSpeed', opt.value);
                }}
                className={cn(
                  "py-1.5 px-2 text-xs rounded-lg border transition-colors",
                  animationSpeed === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-background/30 hover:border-primary/40 text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="liquid-glass-card p-3 rounded-2xl space-y-2.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            Corners
          </Label>
          <div className="grid grid-cols-3 gap-1.5">
            {BORDER_RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setBorderRadius(opt.value);
                  updateSetting('borderRadius', opt.value);
                }}
                className={cn(
                  "py-1.5 px-2 text-xs border transition-colors",
                  opt.value === 'small' && 'rounded-sm',
                  opt.value === 'medium' && 'rounded-lg',
                  opt.value === 'large' && 'rounded-xl',
                  borderRadius === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-background/30 hover:border-primary/40 text-foreground"
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
          className="w-full h-12 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 hover:bg-accent/10 text-foreground"
          onClick={() => setShowShareDialog(true)}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Share with Community
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
      <div className="pt-3 border-t border-border/40">
        <Button
          variant="ghost"
          className="w-full h-11 rounded-2xl bg-card/40 backdrop-blur-xl border border-border/40 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleReset}
          disabled={resetTheme.isPending}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
