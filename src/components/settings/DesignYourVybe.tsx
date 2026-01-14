import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Sparkles, RotateCcw, Check, RefreshCw, Wand2, Sun, Moon, Share2, Zap, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  useUserTheme, 
  useSaveTheme, 
  useResetTheme, 
  useGenerateTheme,
  applyThemeTokens,
  THEME_PRESETS,
  ThemeTokens,
} from '@/hooks/useCustomTheme';
import { useShareTheme } from '@/hooks/useSharedThemes';
import { cn } from '@/lib/utils';

const PRESET_INFO: Record<string, { name: string; description: string; icon: string }> = {
  classic: { name: 'Classic VYBE', description: 'Pink & cyan neon vibes', icon: '💜' },
  midnight: { name: 'Midnight', description: 'Deep ocean blues', icon: '🌙' },
  neon: { name: 'Neon', description: 'Electric purple glow', icon: '⚡' },
  soft: { name: 'Soft', description: 'Warm pastel comfort', icon: '🌸' },
  cyberpunk: { name: 'Cyberpunk', description: 'Yellow & pink future', icon: '🤖' },
  minimal: { name: 'Minimal', description: 'Clean black & white', icon: '⬛' },
};

const ANIMATION_SPEEDS = [
  { value: 'slow', label: 'Slow', description: 'Relaxed, gentle animations' },
  { value: 'normal', label: 'Normal', description: 'Balanced feel' },
  { value: 'fast', label: 'Fast', description: 'Snappy, quick transitions' },
  { value: 'instant', label: 'Instant', description: 'No delay, immediate' },
] as const;

const ANIMATION_STYLES = [
  { value: 'smooth', label: 'Smooth', description: 'Natural easing' },
  { value: 'bouncy', label: 'Bouncy', description: 'Playful spring effect' },
  { value: 'snappy', label: 'Snappy', description: 'Sharp, crisp motion' },
  { value: 'none', label: 'None', description: 'Disable animations' },
] as const;

export function DesignYourVybe() {
  const { data: userTheme, isLoading: isLoadingTheme } = useUserTheme();
  const saveTheme = useSaveTheme();
  const resetTheme = useResetTheme();
  const generateTheme = useGenerateTheme();
  const shareTheme = useShareTheme();

  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('classic');
  const [previewTheme, setPreviewTheme] = useState<ThemeTokens | null>(null);
  const [generatedName, setGeneratedName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareDescription, setShareDescription] = useState('');
  
  // Animation settings
  const [animationSpeed, setAnimationSpeed] = useState<'slow' | 'normal' | 'fast' | 'instant'>('normal');
  const [animationStyle, setAnimationStyle] = useState<'smooth' | 'bouncy' | 'snappy' | 'none'>('smooth');

  const generationRunIdRef = useRef(0);
  const GENERATION_TIMEOUT_MS = 30000;

  // Lock scroll while generating
  useEffect(() => {
    if (isGenerating) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isGenerating]);

  // Load user's current theme/preset on mount
  useEffect(() => {
    if (userTheme) {
      setSelectedPreset(userTheme.base_preset || 'classic');
      if (userTheme.theme_tokens && userTheme.is_active) {
        const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
        setPreviewTheme(tokens);
        setGeneratedName(userTheme.theme_name || '');
        // Load saved animation settings
        setAnimationSpeed(tokens.animationSpeed || 'normal');
        setAnimationStyle(tokens.animationStyle || 'smooth');
      }
    }
  }, [userTheme]);

  const handlePresetSelect = (presetKey: string) => {
    try {
      setSelectedPreset(presetKey);
      const preset = THEME_PRESETS[presetKey];
      if (preset) {
        const themeWithAnimations = { 
          ...preset, 
          animationSpeed, 
          animationStyle 
        };
        setPreviewTheme(themeWithAnimations);
        setGeneratedName(PRESET_INFO[presetKey]?.name || presetKey);
        applyThemeTokens(themeWithAnimations);
        setShowConfirmation(true);
      }
    } catch (error) {
      console.error('Error selecting preset:', error);
    }
  };

  // Apply animation changes live
  const handleAnimationChange = (speed: typeof animationSpeed, style: typeof animationStyle) => {
    setAnimationSpeed(speed);
    setAnimationStyle(style);
    
    const currentTheme = previewTheme || THEME_PRESETS[selectedPreset];
    if (currentTheme) {
      const updatedTheme = {
        ...currentTheme,
        animationSpeed: speed,
        animationStyle: style,
      };
      setPreviewTheme(updatedTheme);
      applyThemeTokens(updatedTheme);
      setShowConfirmation(true);
    }
  };

  const handleGenerateTheme = async () => {
    if (!prompt.trim()) return;

    const runId = (generationRunIdRef.current += 1);
    const promptValue = prompt.trim();

    setIsGenerating(true);
    console.debug('[DesignYourVybe] generateTheme:start', { runId, basePreset: selectedPreset });

    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race<T>([
        promise,
        new Promise<T>((_resolve, reject) =>
          setTimeout(() => reject(new Error('THEME_GENERATION_TIMEOUT')), ms)
        ),
      ]);

    try {
      const theme = await withTimeout(
        generateTheme.mutateAsync({
          prompt: promptValue,
          basePreset: selectedPreset,
        }),
        GENERATION_TIMEOUT_MS
      );

      if (generationRunIdRef.current !== runId) return;

      // Validate theme has required properties
      if (theme && typeof theme === 'object' && 'colorPrimary' in theme && (theme as any).colorPrimary) {
        const themeWithAnimations = {
          ...(theme as any),
          animationSpeed,
          animationStyle,
        } as ThemeTokens & { themeName?: string };

        setPreviewTheme(themeWithAnimations);
        setGeneratedName((themeWithAnimations as any).themeName || 'Custom Theme');
        applyThemeTokens(themeWithAnimations);
        setShowConfirmation(true);
        console.debug('[DesignYourVybe] generateTheme:success', { runId });
      } else {
        console.error('[DesignYourVybe] Invalid theme response:', theme);
        toast.error('Generated theme was invalid. Please try again.');
      }
    } catch (error: any) {
      if (generationRunIdRef.current !== runId) return;

      const msg = String(error?.message || '');
      console.error('[DesignYourVybe] generateTheme:error', { runId, error });

      if (msg.includes('THEME_GENERATION_TIMEOUT')) {
        // Clear the mutation state so the user can try again immediately
        generateTheme.reset();
        toast.error('Theme generation timed out. Please try again.');
      }
      // Other errors already surface via the mutation's onError toast
    } finally {
      if (generationRunIdRef.current === runId) {
        setIsGenerating(false);
        console.debug('[DesignYourVybe] generateTheme:finally', { runId });
      }
    }
  };

  const handleKeepTheme = async () => {
    if (!previewTheme) return;
    
    const themeWithAnimations = {
      ...previewTheme,
      animationSpeed,
      animationStyle,
    };
    
    await saveTheme.mutateAsync({
      themeTokens: themeWithAnimations,
      themeName: generatedName,
      basePreset: selectedPreset,
    });
    setShowConfirmation(false);
    setPrompt('');
  };

  const handleTryAgain = () => {
    setShowConfirmation(false);
    // Keep the prompt for refinement
  };

  const handleReset = async () => {
    await resetTheme.mutateAsync();
    setPreviewTheme(null);
    setGeneratedName('');
    setSelectedPreset('classic');
    setShowConfirmation(false);
    setPrompt('');
    setAnimationSpeed('normal');
    setAnimationStyle('smooth');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Design Your Own VYBE
          </CardTitle>
          <CardDescription>
            Customize your app's appearance using natural language or choose a preset theme.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Theme Generator */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Theme Designer</span>
            </div>
            
            <div className="relative">
              <Textarea
                placeholder="Describe your vibe... e.g., 'Dark purple with neon accents' or 'Soft pastel colors with rounded buttons'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] pr-24 resize-none"
                disabled={isGenerating}
              />
              <Button
                size="sm"
                className="absolute bottom-3 right-3"
                onClick={handleGenerateTheme}
                disabled={!prompt.trim() || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Designing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Theme Presets */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Quick Presets</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(PRESET_INFO).map(([key, info]) => {
                const preset = THEME_PRESETS[key];
                const isSelected = selectedPreset === key && !previewTheme;
                
                return (
                  <motion.button
                    key={key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePresetSelect(key)}
                    className={cn(
                      "relative p-4 rounded-xl border-2 transition-all text-left",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                        style={{ 
                          background: `linear-gradient(135deg, hsl(${preset.bgMain}), hsl(${preset.bgCard}))`,
                          border: `2px solid hsl(${preset.colorPrimary})`,
                        }}
                      >
                        {info.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{info.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {info.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Full color preview showing background + accents */}
                    <div className="mt-3 p-2 rounded-lg" style={{ background: `hsl(${preset.bgMain})` }}>
                      <div className="flex gap-1">
                        <div 
                          className="h-3 flex-1 rounded-full"
                          style={{ background: `hsl(${preset.colorPrimary})` }}
                        />
                        <div 
                          className="h-3 flex-1 rounded-full"
                          style={{ background: `hsl(${preset.colorSecondary})` }}
                        />
                        <div 
                          className="h-3 flex-1 rounded-full"
                          style={{ background: `hsl(${preset.colorAccent})` }}
                        />
                      </div>
                    </div>
                    
                    {/* Mode indicator */}
                    <div className="absolute top-2 right-2">
                      {preset.mode === 'dark' ? (
                        <Moon className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Sun className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Animation Settings */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Animation Settings</span>
            </div>
            
            {/* Animation Speed */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Timer className="h-3 w-3" />
                Speed
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {ANIMATION_SPEEDS.map((speed) => (
                  <motion.button
                    key={speed.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAnimationChange(speed.value, animationStyle)}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all",
                      animationSpeed === speed.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="text-xs font-medium">{speed.label}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Animation Style */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Style
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {ANIMATION_STYLES.map((style) => (
                  <motion.button
                    key={style.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAnimationChange(animationSpeed, style.value)}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all",
                      animationStyle === style.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <p className="text-xs font-medium">{style.label}</p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Animation Preview */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-3">
                <motion.div
                  key={`${animationSpeed}-${animationStyle}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    duration: animationSpeed === 'instant' ? 0.05 : animationSpeed === 'fast' ? 0.15 : animationSpeed === 'slow' ? 0.5 : 0.3,
                    ease: animationStyle === 'bouncy' ? [0.34, 1.56, 0.64, 1] : animationStyle === 'snappy' ? [0.22, 1, 0.36, 1] : [0.4, 0, 0.2, 1],
                  }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium capitalize">{animationSpeed} + {animationStyle}</p>
                  <p className="text-xs text-muted-foreground">
                    {ANIMATION_SPEEDS.find(s => s.value === animationSpeed)?.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation Dialog */}
          <AnimatePresence>
            {showConfirmation && previewTheme && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl border-2 border-primary bg-primary/5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-xl"
                    style={{ 
                      background: `linear-gradient(135deg, hsl(${previewTheme.colorPrimary}), hsl(${previewTheme.colorAccent}))` 
                    }}
                  />
                  <div>
                    <p className="font-semibold">{generatedName}</p>
                    <p className="text-sm text-muted-foreground">
                      Want to keep this look?
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleKeepTheme}
                    disabled={saveTheme.isPending}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Keep Theme
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleTryAgain}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>

                {/* Share Theme Option */}
                <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" className="w-full">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share with Community
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Share Your Theme</DialogTitle>
                      <DialogDescription>
                        Share "{generatedName}" with the VYBE community
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-16 h-16 rounded-xl"
                          style={{ 
                            background: `linear-gradient(135deg, hsl(${previewTheme.colorPrimary}), hsl(${previewTheme.colorAccent}))` 
                          }}
                        />
                        <div className="flex-1">
                          <p className="font-semibold">{generatedName}</p>
                          <p className="text-xs text-muted-foreground">{previewTheme.mode} mode</p>
                        </div>
                      </div>
                      <Input
                        placeholder="Add a description (optional)"
                        value={shareDescription}
                        onChange={(e) => setShareDescription(e.target.value)}
                      />
                      <Button 
                        className="w-full"
                        onClick={async () => {
                          await shareTheme.mutateAsync({
                            themeName: generatedName,
                            themeTokens: previewTheme,
                            description: shareDescription || undefined,
                          });
                          setShareDialogOpen(false);
                          setShareDescription('');
                        }}
                        disabled={shareTheme.isPending}
                      >
                        {shareTheme.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Sharing...
                          </>
                        ) : (
                          <>
                            <Share2 className="h-4 w-4 mr-2" />
                            Share Theme
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reset Button */}
          <div className="pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={resetTheme.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generating Animation Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="text-center space-y-4"
            >
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.1, 1],
                }}
                transition={{ 
                  rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
                  scale: { duration: 1, repeat: Infinity },
                }}
                className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              >
                <Palette className="h-8 w-8 text-white" />
              </motion.div>
              <div>
                <p className="text-lg font-semibold">Designing your VYBE...</p>
                <p className="text-sm text-muted-foreground">
                  Creating a custom theme just for you
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
