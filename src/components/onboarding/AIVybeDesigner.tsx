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
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { applyThemeTokens, useSaveTheme, ThemeTokens } from '@/hooks/useCustomTheme';
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
  { label: 'Analyzing your vibe...', icon: Sparkles, duration: 800 },
  { label: 'Generating color palette...', icon: Palette, duration: 1000 },
  { label: 'Crafting animations...', icon: Zap, duration: 800 },
  { label: 'Adding visual effects...', icon: Stars, duration: 1000 },
  { label: 'Perfecting the details...', icon: Wand2, duration: 800 },
  { label: 'Finalizing your VYBE...', icon: Heart, duration: 600 },
];

export function AIVybeDesigner({ interests = [], onComplete, onSkip }: AIVybeDesignerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const saveTheme = useSaveTheme();
  
  const [step, setStep] = useState<'intro' | 'vibe-select' | 'prompt' | 'building' | 'preview'>('intro');
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);
  const [generatedTheme, setGeneratedTheme] = useState<GeneratedTheme | null>(null);
  const [showPreviewElements, setShowPreviewElements] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

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
    
    const fullPrompt = [
      customPrompt,
      vibePrompt,
      interestSuggestion,
      'Create a stunning, immersive theme that transforms the entire app experience'
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
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const theme = data.theme as GeneratedTheme;
      
      // Wait for build animation to complete
      const totalBuildTime = BUILD_PHASES.reduce((sum, p) => sum + p.duration, 0);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, totalBuildTime - 2000)));
      
      setGeneratedTheme(theme);
      
      // Apply the theme with a dramatic reveal
      applyThemeTokens(theme);
      
      // Transition to preview
      setTimeout(() => {
        setStep('preview');
        setShowPreviewElements(true);
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
              className="text-3xl sm:text-4xl font-bold mb-4 gradient-text"
            >
              Design Your VYBE
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-lg text-muted-foreground mb-8 max-w-md"
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
                className="gradient-animated text-lg px-8 py-6"
              >
                <Wand2 className="mr-2 h-5 w-5" />
                Let's Design
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              
              {onSkip && (
                <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
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
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2">
                What's Your Vibe?
              </h2>
              <p className="text-muted-foreground">
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
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="text-sm font-medium text-center">
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
                onClick={() => setStep('prompt')}
                disabled={!selectedVibe}
                className="w-full gradient-animated"
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
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-2">
                Tell Us More
              </h2>
              <p className="text-muted-foreground">
                Describe your perfect VYBE in your own words (optional)
              </p>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
              {/* Selected vibe badge */}
              {selectedVibe && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4"
                >
                  {(() => {
                    const vibe = PERSONALITY_VIBES.find(v => v.id === selectedVibe);
                    if (!vibe) return null;
                    const Icon = vibe.icon;
                    return (
                      <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-full",
                        "bg-gradient-to-r", vibe.color, "text-white"
                      )}>
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{vibe.label}</span>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
              
              <div className="relative w-full">
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., 'Make it glow like a sunset over the ocean' or 'Cyberpunk city at night with neon rain'"
                  className="min-h-[150px] text-lg resize-none"
                />
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
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
                      className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
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
                onClick={() => setStep('vibe-select')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                size="lg"
                onClick={generateTheme}
                className="flex-[2] gradient-animated"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Generate My VYBE
              </Button>
            </div>
          </motion.div>
        )}

        {/* BUILDING STEP */}
        {step === 'building' && (
          <motion.div
            key="building"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="relative z-10 h-full flex flex-col items-center justify-center p-6"
          >
            {/* Central orb animation */}
            <div className="relative mb-12">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 360],
                }}
                transition={{ 
                  scale: { duration: 2, repeat: Infinity },
                  rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                }}
                className="w-40 h-40 rounded-full bg-gradient-conic from-primary via-accent to-primary p-1"
              >
                <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                  <VybeMiniIcon size={60} showSparkles />
                </div>
              </motion.div>
              
              {/* Orbiting particles */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ 
                    duration: 3 + i * 0.5, 
                    repeat: Infinity, 
                    ease: "linear",
                    delay: i * 0.2,
                  }}
                  className="absolute inset-0"
                  style={{ transform: `rotate(${i * 45}deg)` }}
                >
                  <motion.div
                    animate={{ scale: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary"
                  />
                </motion.div>
              ))}
            </div>
            
            {/* Build phases */}
            <div className="space-y-4 w-full max-w-sm">
              {BUILD_PHASES.map((phase, index) => {
                const Icon = phase.icon;
                const isActive = buildPhase === index;
                const isComplete = buildPhase > index;
                
                return (
                  <motion.div
                    key={phase.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: isActive || isComplete ? 1 : 0.3,
                      x: 0,
                    }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl transition-colors",
                      isActive && "bg-primary/10 border border-primary/20",
                      isComplete && "text-primary"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      isActive && "bg-primary text-primary-foreground",
                      isComplete && "bg-primary/20 text-primary",
                      !isActive && !isComplete && "bg-muted text-muted-foreground"
                    )}>
                      {isComplete ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className={cn("h-4 w-4", isActive && "animate-pulse")} />
                      )}
                    </div>
                    <span className={cn(
                      "text-sm font-medium",
                      isActive && "text-foreground",
                      !isActive && !isComplete && "text-muted-foreground"
                    )}>
                      {phase.label}
                    </span>
                    {isActive && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="ml-auto"
                      >
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
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
              <h2 className="text-2xl sm:text-3xl font-bold gradient-text mb-1">
                {generatedTheme?.themeName || 'Your VYBE'}
              </h2>
              <p className="text-muted-foreground">
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
                      <div className="font-semibold">Your Feed</div>
                      <div className="text-sm text-muted-foreground">Looks amazing!</div>
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
                  <Button className="flex-1 gradient-animated">Primary</Button>
                  <Button variant="outline" className="flex-1">Secondary</Button>
                </motion.div>
                
                {/* Mock input */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 }}
                  className="liquid-glass-card p-4 rounded-2xl"
                >
                  <div className="bg-input rounded-xl p-3 text-input-foreground">
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
                  <div className="w-12 h-12 rounded-xl bg-primary" title="Primary" />
                  <div className="w-12 h-12 rounded-xl bg-secondary" title="Secondary" />
                  <div className="w-12 h-12 rounded-xl bg-accent" title="Accent" />
                  <div className="w-12 h-12 rounded-xl bg-muted" title="Muted" />
                </motion.div>
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
                  className="flex-1"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try Different
                </Button>
                <Button
                  onClick={handleKeepTheme}
                  className="flex-[2] gradient-animated"
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
