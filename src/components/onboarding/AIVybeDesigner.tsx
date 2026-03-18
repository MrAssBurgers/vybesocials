import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Sparkles, 
  Wand2, 
  Palette, 
  Zap, 
  Stars, 
  Heart, 
  Music, 
  Flame,
  Moon,
  Sun,
  Cloud,
  Snowflake,
  Waves,
  Leaf,
  Coffee,
  Camera,
  Gamepad2,
  Book,
  Plane,
  Dumbbell,
  Send,
  RotateCcw,
  Check,
  ArrowRight,
  ArrowLeft,
  Type,
  Sliders,
  Wand
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { applyThemeTokens, useSaveTheme, ThemeTokens } from '@/hooks/useCustomTheme';
import { navVisibility } from '@/lib/navVisibility';
import { 
  FONT_PAIRINGS, 
  FontPairingKey, 
  ANIMATION_PRESETS, 
  AnimationPresetKey,
  loadGoogleFonts,
  applyFontFamily,
  applyAnimationSettings
} from '@/hooks/useApplyThemeFonts';
import { FontSelector } from './FontSelector';
import { AnimationSelector } from './AnimationSelector';
import { VybeGenerationAnimation } from './VybeGenerationAnimation';
import { toast } from 'sonner';

// Personality types for AI to understand
const PERSONALITY_VIBES = [
  { id: 'chill', label: 'Chill & Calm', icon: Cloud, color: 'from-blue-400 to-cyan-500', prompt: 'calm, peaceful, serene ocean vibes with soft blues and gentle animations' },
  { id: 'bold', label: 'Bold & Vibrant', icon: Flame, color: 'from-orange-500 to-red-500', prompt: 'bold, energetic, vibrant with hot colors and dynamic effects' },
  { id: 'dark', label: 'Dark & Mysterious', icon: Moon, color: 'from-purple-600 to-indigo-900', prompt: 'dark, mysterious, gothic vibes with deep purples and subtle glow effects' },
  { id: 'pastel', label: 'Soft & Dreamy', icon: Heart, color: 'from-pink-300 to-purple-300', prompt: 'soft pastel, dreamy, aesthetic with gentle pinks and lavenders' },
  { id: 'neon', label: 'Neon & Electric', icon: Zap, color: 'from-cyan-400 to-pink-500', prompt: 'cyberpunk neon, electric, glowing with bright neons against dark backgrounds' },
  { id: 'nature', label: 'Nature & Earth', icon: Leaf, color: 'from-green-400 to-emerald-600', prompt: 'natural, earthy, forest vibes with greens and organic textures' },
  { id: 'minimal', label: 'Clean & Minimal', icon: Sun, color: 'from-gray-100 to-gray-300', prompt: 'minimal, clean, modern with monochrome palette and sharp edges' },
  { id: 'cozy', label: 'Warm & Cozy', icon: Coffee, color: 'from-amber-400 to-orange-600', prompt: 'warm, cozy, autumn vibes with warm oranges and browns' },
];

// Interest-based theme suggestions
const INTEREST_THEMES: Record<string, string> = {
  'Gaming': 'cyberpunk gaming vibes with neon RGB lighting and dark backgrounds',
  'Music': 'music festival aesthetic with vibrant gradients and soundwave effects',
  'Art': 'artistic creative palette with bold colors and abstract geometric patterns',
  'Photography': 'minimal camera aesthetic with neutral tones and subtle shadows',
  'Sports': 'energetic athletic vibes with bold primary colors and dynamic motion',
  'Fashion': 'high fashion editorial style with sophisticated blacks and gold accents',
  'Travel': 'wanderlust sunset vibes with warm oranges and adventure-inspired tones',
  'Food': 'fresh culinary aesthetic with appetizing warm colors and clean design',
  'Fitness': 'powerful gym aesthetic with intense reds and energizing greens',
  'Reading': 'cozy library vibes with warm amber tones and classic elegance',
  'Movies': 'cinematic experience with dramatic dark tones and spotlight effects',
  'Technology': 'futuristic tech aesthetic with electric blues and sleek interfaces',
  'Nature': 'organic forest theme with natural greens and earthy textures',
  'Animals': 'playful pet-friendly colors with soft pastels and cheerful tones',
  'Dance': 'dance floor energy with purple and pink party vibes',
};

interface AIVybeDesignerProps {
  interests?: string[];
  onComplete: () => void;
  onSkip?: () => void;
}

interface GeneratedTheme extends ThemeTokens {
  themeName: string;
  fontFamily?: string;
  fontDisplay?: string;
}

// Build phases for the animation
const BUILD_PHASES = [
  { label: 'Analyzing your vibe...', icon: Sparkles, duration: 600 },
  { label: 'Generating color palette...', icon: Palette, duration: 800 },
  { label: 'Selecting typography...', icon: Type, duration: 600 },
  { label: 'Crafting animations...', icon: Zap, duration: 800 },
  { label: 'Adding visual effects...', icon: Stars, duration: 600 },
  { label: 'Finalizing your VYBE...', icon: Heart, duration: 500 },
];

export function AIVybeDesigner({ interests = [], onComplete, onSkip }: AIVybeDesignerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const saveTheme = useSaveTheme();
  
  const [step, setStep] = useState<'intro' | 'vibe-select' | 'font-select' | 'animation-select' | 'prompt' | 'building' | 'confirm' | 'preview'>('intro');
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [selectedFont, setSelectedFont] = useState<FontPairingKey | null>(null);
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationPresetKey | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);
  const [generatedTheme, setGeneratedTheme] = useState<GeneratedTheme | null>(null);
  const [showPreviewElements, setShowPreviewElements] = useState(false);
  const [previousThemeSnapshot, setPreviousThemeSnapshot] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hide nav when designer opens, show when it closes
  // Save current theme snapshot for revert
  useEffect(() => {
    navVisibility.setInDesigner(true);
    // Capture current CSS custom properties as snapshot
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const snapshot: Record<string, string> = {};
    const props = ['--background', '--foreground', '--primary', '--secondary', '--accent', '--muted', '--card', '--border', '--input', '--ring', '--primary-foreground', '--secondary-foreground', '--accent-foreground', '--muted-foreground', '--card-foreground'];
    props.forEach(p => { snapshot[p] = styles.getPropertyValue(p).trim(); });
    setPreviousThemeSnapshot(JSON.stringify(snapshot));
    return () => navVisibility.setInDesigner(false);
  }, []);

  // Generate suggestion based on interests
  const getInterestSuggestion = useCallback(() => {
    const matchingInterest = interests.find(i => INTEREST_THEMES[i]);
    if (matchingInterest) {
      return INTEREST_THEMES[matchingInterest];
    }
    return null;
  }, [interests]);

  // Animate through build phases
  useEffect(() => {
    if (step !== 'building') return;
    
    let currentPhase = 0;
    const runPhase = () => {
      if (currentPhase >= BUILD_PHASES.length) return;
      
      setBuildPhase(currentPhase);
      currentPhase++;
      
      if (currentPhase < BUILD_PHASES.length) {
        setTimeout(runPhase, BUILD_PHASES[currentPhase - 1].duration);
      }
    };
    
    runPhase();
  }, [step]);

  // Generate the theme
  const generateTheme = async () => {
    const vibePrompt = selectedVibe 
      ? PERSONALITY_VIBES.find(v => v.id === selectedVibe)?.prompt 
      : '';
    const interestSuggestion = getInterestSuggestion();
    
    // Include font and animation preferences
    const fontPreference = selectedFont ? `Use ${FONT_PAIRINGS[selectedFont].description} typography style` : '';
    const animPreference = selectedAnimation ? `Use ${ANIMATION_PRESETS[selectedAnimation].description} animation style` : '';
    
    const fullPrompt = [
      customPrompt,
      vibePrompt,
      interestSuggestion,
      fontPreference,
      animPreference,
      'Create a stunning, immersive theme that transforms the entire app experience. Ensure excellent contrast - text must always be readable.'
    ].filter(Boolean).join('. ');
    
    if (!fullPrompt.trim()) {
      toast.error('Please describe your vibe or select a style');
      return;
    }
    
    setStep('building');
    setIsGenerating(true);
    abortControllerRef.current = new AbortController();
    
    try {
      // Call the enhanced theme generation
      const { data, error } = await supabase.functions.invoke('generate-advanced-theme', {
        body: { 
          prompt: fullPrompt,
          interests,
          includeFont: true,
          includeEffects: true,
          selectedFont: selectedFont,
          selectedAnimation: selectedAnimation,
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const theme = data.theme as GeneratedTheme;
      
      // Apply font and animation selections
      if (selectedFont) {
        const fonts = FONT_PAIRINGS[selectedFont];
        await loadGoogleFonts([fonts.body, fonts.display]);
        applyFontFamily(fonts.body, fonts.display);
        theme.fontFamily = fonts.body;
        theme.fontDisplay = fonts.display;
      }
      
      if (selectedAnimation) {
        const anim = ANIMATION_PRESETS[selectedAnimation];
        applyAnimationSettings(anim.speed, anim.style);
        theme.animationSpeed = anim.speed as any;
        theme.animationStyle = anim.style as any;
      }
      
      // Wait for build animation to complete
      const totalBuildTime = BUILD_PHASES.reduce((sum, p) => sum + p.duration, 0);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, totalBuildTime - 2000)));
      
      setGeneratedTheme(theme);
      
      // Apply the theme with a dramatic reveal
      applyThemeTokens(theme);
      
      // Transition to confirmation before applying
      setTimeout(() => {
        setStep('confirm');
      }, 500);
      
    } catch (error: any) {
      console.error('Theme generation error:', error);
      
      if (error.name === 'AbortError') return;
      
      // Fallback to basic generation
      try {
        const { data } = await supabase.functions.invoke('generate-theme', {
          body: { prompt: fullPrompt, basePreset: 'classic' },
        });
        
        if (data?.theme) {
          setGeneratedTheme({ ...data.theme, themeName: 'Custom VYBE' });
          applyThemeTokens(data.theme);
          setStep('preview');
          setShowPreviewElements(true);
        } else {
          throw new Error('No theme generated');
        }
      } catch {
        toast.error('Could not generate theme. Using default.');
        setStep('preview');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Save the theme
  const handleKeepTheme = async () => {
    if (!generatedTheme) {
      onComplete();
      return;
    }
    
    try {
      await saveTheme.mutateAsync({
        themeTokens: generatedTheme,
        themeName: generatedTheme.themeName || 'My VYBE',
        basePreset: 'custom',
      });
      
      toast.success('Your VYBE is saved! ✨');
      onComplete();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Could not save theme');
      onComplete();
    }
  };

  // Try different theme
  const handleTryAgain = () => {
    setStep('vibe-select');
    setSelectedVibe(null);
    setSelectedFont(null);
    setSelectedAnimation(null);
    setCustomPrompt('');
    setGeneratedTheme(null);
    setBuildPhase(0);
    setShowPreviewElements(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-30"
        >
          <div className="w-full h-full bg-gradient-conic from-primary via-accent to-primary rounded-full blur-3xl" />
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        {/* INTRO STEP */}
        {step === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative z-10 h-full flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="mb-8"
            >
              <div className="relative">
                <VybeMiniIcon size={100} showSparkles className="mx-auto" />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 -m-4"
                >
                  <div className="w-full h-full border-2 border-primary/30 rounded-full border-dashed" />
                </motion.div>
              </div>
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-3xl sm:text-4xl font-bold mb-4 gradient-text drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
            >
              Design Your VYBE
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-lg text-foreground/80 mb-8 max-w-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
            >
              Our AI will craft a completely unique look just for you. 
              Colors, fonts, animations – everything tailored to your style.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex flex-col gap-3"
            >
              <Button
                size="lg"
                onClick={() => setStep('vibe-select')}
                className="gradient-animated text-lg px-8 py-6 text-primary-foreground font-semibold"
              >
                <Wand2 className="mr-2 h-5 w-5" />
                Let's Design
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              
              {onSkip && (
                <Button variant="ghost" onClick={onSkip} className="text-foreground/70 hover:text-foreground">
                  Skip for now
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* VIBE SELECT STEP */}
        {step === 'vibe-select' && (
          <motion.div
            key="vibe-select"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="relative z-10 h-full flex flex-col p-4 sm:p-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                What's Your Vibe?
              </h2>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Select a style that matches your personality
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                {PERSONALITY_VIBES.map((vibe, index) => {
                  const Icon = vibe.icon;
                  const isSelected = selectedVibe === vibe.id;
                  
                  return (
                    <motion.button
                      key={vibe.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedVibe(isSelected ? null : vibe.id)}
                      className={cn(
                        "relative p-4 rounded-2xl transition-all duration-300",
                        "border-2 flex flex-col items-center gap-2",
                        isSelected 
                          ? "border-primary bg-primary/10 scale-105 shadow-lg shadow-primary/20"
                          : "border-border bg-card/50 hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        "bg-gradient-to-br", vibe.color
                      )}>
                        <Icon className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                      </div>
                      <span className="text-sm font-semibold text-center text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                        {vibe.label}
                      </span>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center"
                        >
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              <Button
                size="lg"
                onClick={() => setStep('font-select')}
                disabled={!selectedVibe}
                className="w-full gradient-animated text-primary-foreground font-semibold"
              >
                Continue
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* FONT SELECT STEP */}
        {step === 'font-select' && (
          <motion.div
            key="font-select"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="relative z-10 h-full flex flex-col p-4 sm:p-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                Choose Your Font
              </h2>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Typography that matches your personality
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
              <FontSelector 
                selectedFont={selectedFont} 
                onSelect={setSelectedFont} 
              />
            </div>
            
            <div className="pt-4 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('vibe-select')}
                className="flex-1 text-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => setStep('animation-select')}
                className="flex-[2] gradient-animated text-primary-foreground font-semibold"
              >
                Continue
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ANIMATION SELECT STEP */}
        {step === 'animation-select' && (
          <motion.div
            key="animation-select"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="relative z-10 h-full flex flex-col p-4 sm:p-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                Pick Your Motion
              </h2>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                How should your app feel when you interact?
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
              <AnimationSelector 
                selectedAnimation={selectedAnimation} 
                onSelect={setSelectedAnimation} 
              />
            </div>
            
            <div className="pt-4 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('font-select')}
                className="flex-1 text-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => setStep('prompt')}
                className="flex-[2] gradient-animated text-primary-foreground font-semibold"
              >
                Continue
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* PROMPT STEP */}
        {step === 'prompt' && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="relative z-10 h-full flex flex-col p-4 sm:p-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                Tell Us More
              </h2>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Describe your perfect VYBE in your own words (optional)
              </p>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
              {/* Selected options summary */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex flex-wrap gap-2 justify-center"
              >
                {selectedVibe && (
                  <div className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm",
                    "bg-gradient-to-r",
                    PERSONALITY_VIBES.find(v => v.id === selectedVibe)?.color || 'from-primary to-accent'
                  )}>
                    {(() => {
                      const vibe = PERSONALITY_VIBES.find(v => v.id === selectedVibe);
                      if (!vibe) return null;
                      const Icon = vibe.icon;
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                    <span className="font-medium">{PERSONALITY_VIBES.find(v => v.id === selectedVibe)?.label}</span>
                  </div>
                )}
                {selectedFont && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm">
                    <Type className="h-3.5 w-3.5" />
                    <span className="font-medium">{FONT_PAIRINGS[selectedFont].description}</span>
                  </div>
                )}
                {selectedAnimation && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm">
                    <Zap className="h-3.5 w-3.5" />
                    <span className="font-medium">{ANIMATION_PRESETS[selectedAnimation].description}</span>
                  </div>
                )}
              </motion.div>
              
              <div className="relative w-full">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., 'Make it glow like a sunset over the ocean' or 'Cyberpunk city at night with neon rain'"
                  className="min-h-[150px] text-lg resize-none text-foreground"
                />
                <div className="absolute bottom-3 right-3 text-xs text-foreground/60">
                  {customPrompt.length}/200
                </div>
              </div>
              
              {/* Quick suggestions based on interests */}
              {interests.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {interests.slice(0, 4).map((interest) => (
                    <button
                      key={interest}
                      onClick={() => setCustomPrompt(prev => 
                        prev ? `${prev}, ${interest.toLowerCase()} inspired` : `${interest.toLowerCase()} aesthetic`
                      )}
                      className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                      + {interest}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-border flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('animation-select')}
                className="flex-1 text-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                size="lg"
                onClick={generateTheme}
                className="flex-[2] gradient-animated text-primary-foreground font-semibold"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Generate My VYBE
              </Button>
            </div>
          </motion.div>
        )}

        {/* BUILDING STEP */}
        {step === 'building' && (
          <VybeGenerationAnimation 
            isGenerating={isGenerating}
            buildPhase={buildPhase}
            phases={BUILD_PHASES}
          />
        )}

        {/* PREVIEW STEP */}
        {step === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 h-full flex flex-col"
          >
            {/* Theme name header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center py-6"
            >
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {generatedTheme?.themeName || 'Your VYBE'}
              </h2>
              <p className="text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Here's your personalized experience
              </p>
            </motion.div>
            
            {/* Preview area with mock UI elements */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="max-w-md mx-auto space-y-4">
                {/* Mock card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3 }}
                  className="liquid-glass-card p-4 rounded-2xl"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent" />
                    <div>
                      <div className="font-semibold text-foreground">Your Feed</div>
                      <div className="text-sm text-foreground/70">Looks amazing!</div>
                    </div>
                  </div>
                  <div className="h-24 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20" />
                </motion.div>
                
                {/* Mock buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.4 }}
                  className="flex gap-3"
                >
                  <Button className="flex-1 gradient-animated text-primary-foreground font-semibold">Primary</Button>
                  <Button variant="outline" className="flex-1 text-foreground font-semibold">Secondary</Button>
                </motion.div>
                
                {/* Mock input */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 }}
                  className="liquid-glass-card p-4 rounded-2xl"
                >
                  <div className="bg-input rounded-xl p-3 text-foreground font-medium">
                    Your messages will look like this
                  </div>
                </motion.div>
                
                {/* Color palette display */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.6 }}
                  className="flex gap-2 justify-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary shadow-lg" title="Primary" />
                  <div className="w-12 h-12 rounded-xl bg-secondary shadow-lg" title="Secondary" />
                  <div className="w-12 h-12 rounded-xl bg-accent shadow-lg" title="Accent" />
                  <div className="w-12 h-12 rounded-xl bg-muted shadow-lg" title="Muted" />
                </motion.div>
                
                {/* Font preview */}
                {generatedTheme?.fontFamily && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.7 }}
                    className="text-center p-4"
                  >
                    <p className="text-xs text-foreground/60 mb-1">Typography</p>
                    <p 
                      className="text-2xl font-bold text-foreground"
                      style={{ fontFamily: `'${generatedTheme.fontDisplay || generatedTheme.fontFamily}', system-ui` }}
                    >
                      {generatedTheme.fontDisplay || generatedTheme.fontFamily}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
            
            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="p-4 border-t border-border bg-background/80 backdrop-blur-sm"
            >
              <div className="max-w-md mx-auto flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleTryAgain}
                  className="flex-1 text-foreground font-semibold"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try Different
                </Button>
                <Button
                  onClick={handleKeepTheme}
                  className="flex-[2] gradient-animated text-primary-foreground font-semibold"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Keep This VYBE
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
