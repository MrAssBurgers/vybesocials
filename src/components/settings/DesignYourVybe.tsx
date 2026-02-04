import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, RotateCcw, Check, RefreshCw, Wand2, Sun, Moon, Share2, Zap, Timer, Volume2, Image, Layers, Pencil } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';

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

const BUTTON_SOUNDS = [
  { value: 'none', label: 'None', description: 'Silent' },
  { value: 'click', label: 'Click', description: 'Soft click' },
  { value: 'pop', label: 'Pop', description: 'Playful pop' },
  { value: 'whoosh', label: 'Whoosh', description: 'Swoosh effect' },
  { value: 'bubble', label: 'Bubble', description: 'Bubbly sound' },
  { value: 'chime', label: 'Chime', description: 'Musical chime' },
] as const;

const BACKGROUND_EFFECTS = [
  { value: 'none', label: 'None', icon: '🚫' },
  { value: 'particles', label: 'Particles', icon: '✨' },
  { value: 'stars', label: 'Stars', icon: '⭐' },
  { value: 'bubbles', label: 'Bubbles', icon: '🫧' },
  { value: 'aurora', label: 'Aurora', icon: '🌌' },
  { value: 'rain', label: 'Rain', icon: '🌧️' },
  { value: 'snow', label: 'Snow', icon: '❄️' },
  { value: 'fireflies', label: 'Fireflies', icon: '🔥' },
  { value: 'geometric', label: 'Geometric', icon: '🔷' },
] as const;

const BORDER_RADIUS_OPTIONS = [
  { value: 'small', label: 'Sharp', description: 'Minimal rounding' },
  { value: 'medium', label: 'Rounded', description: 'Balanced curves' },
  { value: 'large', label: 'Pill', description: 'Maximum rounding' },
] as const;

export function DesignYourVybe() {
  const { data: userTheme, isLoading: isLoadingTheme } = useUserTheme();
  const saveTheme = useSaveTheme();
  const resetTheme = useResetTheme();
  const generateTheme = useGenerateTheme();
  const shareTheme = useShareTheme();
  const { triggerTransition } = useThemeTransition();

  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('classic');
  const [previewTheme, setPreviewTheme] = useState<ThemeTokens | null>(null);
  const [generatedName, setGeneratedName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareDescription, setShareDescription] = useState('');
  const [activeTab, setActiveTab] = useState('colors');
  
  // Animation settings
  const [animationSpeed, setAnimationSpeed] = useState<'slow' | 'normal' | 'fast' | 'instant'>('normal');
  const [animationStyle, setAnimationStyle] = useState<'smooth' | 'bouncy' | 'snappy' | 'none'>('smooth');
  
  // Sound settings
  const [buttonSound, setButtonSound] = useState<string>('none');
  
  // Background settings
  const [backgroundEffect, setBackgroundEffect] = useState<ThemeTokens['backgroundEffect']>('none');
  const [backgroundOpacity, setBackgroundOpacity] = useState(30);
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  
  // Border radius
  const [borderRadius, setBorderRadius] = useState<'small' | 'medium' | 'large'>('medium');

  // Editable theme name
  const [isEditingName, setIsEditingName] = useState(false);

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
        // Load saved settings
        setAnimationSpeed(tokens.animationSpeed || 'normal');
        setAnimationStyle(tokens.animationStyle || 'smooth');
        setBackgroundEffect(tokens.backgroundEffect || 'none');
        setBackgroundOpacity(tokens.backgroundOpacity ?? 30);
        setBackgroundBlur(tokens.backgroundBlur ?? 0);
        setBorderRadius(tokens.borderRadius || 'medium');
      }
    }
  }, [userTheme]);

  const handlePresetSelect = (presetKey: string) => {
    try {
      const preset = THEME_PRESETS[presetKey];
      if (preset) {
        const themeWithSettings = { 
          ...preset, 
          animationSpeed, 
          animationStyle,
          backgroundEffect,
          backgroundOpacity,
          backgroundBlur,
          borderRadius,
        };
        
        const primaryColor = preset.colorPrimary || '280 70% 50%';
        const accentColor = preset.colorAccent || '330 80% 60%';
        
        triggerTransition(primaryColor, accentColor, () => {
          setSelectedPreset(presetKey);
          setPreviewTheme(themeWithSettings);
          setGeneratedName(PRESET_INFO[presetKey]?.name || presetKey);
          applyThemeTokens(themeWithSettings);
          setShowConfirmation(true);
        });
      }
    } catch (error) {
      console.error('Error selecting preset:', error);
    }
  };

  // Apply setting changes live
  const applyCurrentSettings = useCallback(() => {
    const currentTheme = previewTheme || THEME_PRESETS[selectedPreset];
    if (currentTheme) {
      const updatedTheme = {
        ...currentTheme,
        animationSpeed,
        animationStyle,
        backgroundEffect,
        backgroundOpacity,
        backgroundBlur,
        borderRadius,
      };
      setPreviewTheme(updatedTheme);
      applyThemeTokens(updatedTheme);
      setShowConfirmation(true);
    }
  }, [previewTheme, selectedPreset, animationSpeed, animationStyle, backgroundEffect, backgroundOpacity, backgroundBlur, borderRadius]);

  const handleAnimationChange = (speed: typeof animationSpeed, style: typeof animationStyle) => {
    setAnimationSpeed(speed);
    setAnimationStyle(style);
    
    const currentTheme = previewTheme || THEME_PRESETS[selectedPreset];
    if (currentTheme) {
      const updatedTheme = {
        ...currentTheme,
        animationSpeed: speed,
        animationStyle: style,
        backgroundEffect,
        backgroundOpacity,
        backgroundBlur,
        borderRadius,
      };
      setPreviewTheme(updatedTheme);
      applyThemeTokens(updatedTheme);
      setShowConfirmation(true);
    }
  };

  const handleBackgroundEffectChange = (effect: ThemeTokens['backgroundEffect']) => {
    setBackgroundEffect(effect);
    const currentTheme = previewTheme || THEME_PRESETS[selectedPreset];
    if (currentTheme) {
      const updatedTheme = {
        ...currentTheme,
        animationSpeed,
        animationStyle,
        backgroundEffect: effect,
        backgroundOpacity,
        backgroundBlur,
        borderRadius,
      };
      setPreviewTheme(updatedTheme);
      applyThemeTokens(updatedTheme);
      setShowConfirmation(true);
    }
  };

  const handleBorderRadiusChange = (radius: 'small' | 'medium' | 'large') => {
    setBorderRadius(radius);
    const currentTheme = previewTheme || THEME_PRESETS[selectedPreset];
    if (currentTheme) {
      const updatedTheme = {
        ...currentTheme,
        animationSpeed,
        animationStyle,
        backgroundEffect,
        backgroundOpacity,
        backgroundBlur,
        borderRadius: radius,
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

      if (theme && typeof theme === 'object' && 'colorPrimary' in theme && (theme as any).colorPrimary) {
        const themeWithSettings = {
          ...(theme as any),
          animationSpeed,
          animationStyle,
          backgroundEffect,
          backgroundOpacity,
          backgroundBlur,
          borderRadius,
        } as ThemeTokens & { themeName?: string };

        setPreviewTheme(themeWithSettings);
        setGeneratedName((themeWithSettings as any).themeName || 'Custom Theme');
        applyThemeTokens(themeWithSettings);
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
        generateTheme.reset();
        toast.error('Theme generation timed out. Please try again.');
      }
    } finally {
      if (generationRunIdRef.current === runId) {
        setIsGenerating(false);
        console.debug('[DesignYourVybe] generateTheme:finally', { runId });
      }
    }
  };

  const [pendingTheme, setPendingTheme] = useState<{
    tokens: typeof previewTheme;
    name: string;
    preset: string;
  } | null>(null);

  const handleKeepTheme = async () => {
    if (!previewTheme) return;
    
    const themeWithSettings = {
      ...previewTheme,
      animationSpeed,
      animationStyle,
      backgroundEffect,
      backgroundOpacity,
      backgroundBlur,
      borderRadius,
    };
    
    const primaryColor = previewTheme.colorPrimary || '280 70% 50%';
    const accentColor = previewTheme.colorAccent || '330 80% 60%';
    
    triggerTransition(primaryColor, accentColor, async () => {
      applyThemeTokens(themeWithSettings);
      
      await saveTheme.mutateAsync({
        themeTokens: themeWithSettings,
        themeName: generatedName,
        basePreset: selectedPreset,
      });
      
      // Save button sound preference
      localStorage.setItem('vybe-button-sound', buttonSound);
      
      setShowConfirmation(false);
      setPrompt('');
      setPendingTheme(null);
    });
  };

  const handleTryAgain = () => {
    setShowConfirmation(false);
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
    setButtonSound('none');
    setBackgroundEffect('none');
    setBackgroundOpacity(30);
    setBackgroundBlur(0);
    setBorderRadius('medium');
  };

  // Play sound preview
  const playButtonSoundPreview = (sound: string) => {
    if (sound === 'none') return;
    // This would integrate with the actual sound system
    toast.success(`Sound: ${sound}`, { duration: 1000 });
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
            Customize every aspect of your app's appearance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customization Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto">
              <TabsTrigger value="colors" className="text-xs py-2">
                <Palette className="h-3 w-3 mr-1" />
                Colors
              </TabsTrigger>
              <TabsTrigger value="effects" className="text-xs py-2">
                <Layers className="h-3 w-3 mr-1" />
                Effects
              </TabsTrigger>
              <TabsTrigger value="motion" className="text-xs py-2">
                <Zap className="h-3 w-3 mr-1" />
                Motion
              </TabsTrigger>
              <TabsTrigger value="sounds" className="text-xs py-2">
                <Volume2 className="h-3 w-3 mr-1" />
                Sounds
              </TabsTrigger>
            </TabsList>

            {/* Colors Tab */}
            <TabsContent value="colors" className="mt-4 space-y-4">
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
                    className="min-h-[80px] pr-24 resize-none"
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
                        <VybeMiniIcon size={16} showSparkles className="mr-2" />
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
                      <button
                        key={key}
                        onClick={() => handlePresetSelect(key)}
                        className={cn(
                          "relative p-3 rounded-xl border-2 transition-colors text-left active:scale-[0.98]",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                            style={{ 
                              background: `linear-gradient(135deg, hsl(${preset.bgMain}), hsl(${preset.bgCard}))`,
                              border: `2px solid hsl(${preset.colorPrimary})`,
                            }}
                          >
                            {info.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs truncate">{info.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {info.description}
                            </p>
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
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Border Radius */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">Button Style</Label>
                <div className="grid grid-cols-3 gap-2">
                  {BORDER_RADIUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleBorderRadiusChange(option.value)}
                      className={cn(
                        "p-3 border text-center transition-colors active:scale-[0.98]",
                        option.value === 'small' && 'rounded-sm',
                        option.value === 'medium' && 'rounded-lg',
                        option.value === 'large' && 'rounded-2xl',
                        borderRadius === option.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="text-xs font-medium">{option.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Effects Tab */}
            <TabsContent value="effects" className="mt-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Background Effect</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUND_EFFECTS.map((effect) => (
                    <button
                      key={effect.value}
                      onClick={() => handleBackgroundEffectChange(effect.value as ThemeTokens['backgroundEffect'])}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-colors active:scale-[0.98]",
                        backgroundEffect === effect.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="text-lg">{effect.icon}</span>
                      <p className="text-xs font-medium mt-1">{effect.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity & Blur sliders */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Background Opacity: {backgroundOpacity}%
                  </Label>
                  <Slider
                    value={[backgroundOpacity]}
                    onValueChange={([val]) => {
                      setBackgroundOpacity(val);
                      applyCurrentSettings();
                    }}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Background Blur: {backgroundBlur}px
                  </Label>
                  <Slider
                    value={[backgroundBlur]}
                    onValueChange={([val]) => {
                      setBackgroundBlur(val);
                      applyCurrentSettings();
                    }}
                    min={0}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>
            </TabsContent>

            {/* Motion Tab */}
            <TabsContent value="motion" className="mt-4 space-y-4">
              {/* Animation Speed */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Timer className="h-3 w-3" />
                  Speed
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {ANIMATION_SPEEDS.map((speed) => (
                    <button
                      key={speed.value}
                      onClick={() => handleAnimationChange(speed.value, animationStyle)}
                      className={cn(
                        "p-2 rounded-lg border text-center transition-colors active:scale-[0.98]",
                        animationSpeed === speed.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="text-xs font-medium">{speed.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Style */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <VybeMiniIcon size={12} showSparkles />
                  Style
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {ANIMATION_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => handleAnimationChange(animationSpeed, style.value)}
                      className={cn(
                        "p-2 rounded-lg border text-center transition-colors active:scale-[0.98]",
                        animationStyle === style.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="text-xs font-medium">{style.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Preview with Logo */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-3">Preview</p>
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <VYBELogo size="xl" showText={false} animated={true} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{animationSpeed} + {animationStyle}</p>
                    <p className="text-xs text-muted-foreground">
                      {ANIMATION_SPEEDS.find(s => s.value === animationSpeed)?.description}
                    </p>
                  </div>
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
                </div>
              </div>
            </TabsContent>

            {/* Sounds Tab */}
            <TabsContent value="sounds" className="mt-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Button Sounds</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {BUTTON_SOUNDS.map((sound) => (
                    <button
                      key={sound.value}
                      onClick={() => {
                        setButtonSound(sound.value);
                        playButtonSoundPreview(sound.value);
                        setShowConfirmation(true);
                      }}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-colors active:scale-[0.98]",
                        buttonSound === sound.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="text-xs font-medium">{sound.label}</p>
                      <p className="text-[10px] text-muted-foreground">{sound.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                💡 Button sounds play when you tap buttons throughout the app. Choose "None" for a silent experience.
              </div>
            </TabsContent>
          </Tabs>

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
                  <div className="flex-1">
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={generatedName}
                          onChange={(e) => setGeneratedName(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              setIsEditingName(false);
                            }
                          }}
                          onBlur={() => setIsEditingName(false)}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{generatedName}</p>
                        <button
                          onClick={() => setIsEditingName(true)}
                          className="p-1 rounded hover:bg-muted"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
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
                        Share your custom theme with the VYBE community
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
                        <div className="flex-1 space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Theme Name</Label>
                            <Input
                              value={generatedName}
                              onChange={(e) => setGeneratedName(e.target.value)}
                              placeholder="Enter theme name"
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                        <Input
                          placeholder="Describe your theme..."
                          value={shareDescription}
                          onChange={(e) => setShareDescription(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <Button 
                        className="w-full"
                        onClick={async () => {
                          if (!generatedName.trim()) {
                            toast.error('Please enter a theme name');
                            return;
                          }
                          await shareTheme.mutateAsync({
                            themeName: generatedName,
                            themeTokens: previewTheme,
                            description: shareDescription || undefined,
                          });
                          setShareDialogOpen(false);
                          setShareDescription('');
                        }}
                        disabled={shareTheme.isPending || !generatedName.trim()}
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