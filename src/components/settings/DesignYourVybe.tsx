import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Sparkles, RotateCcw, Check, RefreshCw, Wand2, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  useUserTheme, 
  useSaveTheme, 
  useResetTheme, 
  useGenerateTheme,
  applyThemeTokens,
  THEME_PRESETS,
  ThemeTokens,
} from '@/hooks/useCustomTheme';
import { cn } from '@/lib/utils';

const PRESET_INFO: Record<string, { name: string; description: string; icon: string }> = {
  classic: { name: 'Classic VYBE', description: 'Pink & cyan neon vibes', icon: '💜' },
  midnight: { name: 'Midnight', description: 'Deep ocean blues', icon: '🌙' },
  neon: { name: 'Neon', description: 'Electric purple glow', icon: '⚡' },
  soft: { name: 'Soft', description: 'Warm pastel comfort', icon: '🌸' },
  cyberpunk: { name: 'Cyberpunk', description: 'Yellow & pink future', icon: '🤖' },
  minimal: { name: 'Minimal', description: 'Clean black & white', icon: '⬛' },
};

export function DesignYourVybe() {
  const { data: userTheme, isLoading: isLoadingTheme } = useUserTheme();
  const saveTheme = useSaveTheme();
  const resetTheme = useResetTheme();
  const generateTheme = useGenerateTheme();

  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('classic');
  const [previewTheme, setPreviewTheme] = useState<ThemeTokens | null>(null);
  const [generatedName, setGeneratedName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Load user's current theme/preset on mount
  useEffect(() => {
    if (userTheme) {
      setSelectedPreset(userTheme.base_preset || 'classic');
      if (userTheme.theme_tokens && userTheme.is_active) {
        setPreviewTheme(userTheme.theme_tokens as unknown as ThemeTokens);
        setGeneratedName(userTheme.theme_name || '');
      }
    }
  }, [userTheme]);

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const preset = THEME_PRESETS[presetKey];
    setPreviewTheme(preset);
    setGeneratedName(PRESET_INFO[presetKey]?.name || presetKey);
    applyThemeTokens(preset);
    setShowConfirmation(true);
  };

  const handleGenerateTheme = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const theme = await generateTheme.mutateAsync({
        prompt: prompt.trim(),
        basePreset: selectedPreset,
      });
      
      setPreviewTheme(theme);
      setGeneratedName(theme.themeName || 'Custom Theme');
      applyThemeTokens(theme);
      setShowConfirmation(true);
    } catch (error) {
      // Error handled in mutation
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeepTheme = async () => {
    if (!previewTheme) return;
    
    await saveTheme.mutateAsync({
      themeTokens: previewTheme,
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
