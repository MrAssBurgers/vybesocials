import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkles,
  Wand2,
  Palette,
  Zap,
  Heart,
  Flame,
  Moon,
  Sun,
  Cloud,
  Leaf,
  Coffee,
  Type,
  Check,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { applyThemeTokens, useSaveTheme, ThemeTokens } from '@/hooks/useCustomTheme';
import { navVisibility } from '@/lib/navVisibility';
import { resetThemeToDefault } from '@/lib/themeReset';
import {
  FONT_PAIRINGS,
  FontPairingKey,
  ANIMATION_PRESETS,
  AnimationPresetKey,
  loadGoogleFonts,
  applyFontFamily,
  applyAnimationSettings,
} from '@/hooks/useApplyThemeFonts';
import { FontSelector } from './FontSelector';
import { AnimationSelector } from './AnimationSelector';
import { VybeGenerationAnimation } from './VybeGenerationAnimation';
import { toast } from 'sonner';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const PERSONALITY_VIBES = [
  { id: 'chill', label: 'Chill', icon: Cloud, gradient: 'from-blue-400 to-cyan-500', prompt: 'calm, peaceful, serene ocean vibes with soft blues and gentle motion' },
  { id: 'bold', label: 'Bold', icon: Flame, gradient: 'from-orange-500 to-red-500', prompt: 'bold, energetic, vibrant with hot colors and dynamic effects' },
  { id: 'dark', label: 'Mysterious', icon: Moon, gradient: 'from-purple-600 to-indigo-900', prompt: 'dark, mysterious, gothic with deep purples and subtle glow' },
  { id: 'pastel', label: 'Dreamy', icon: Heart, gradient: 'from-pink-300 to-purple-300', prompt: 'soft pastel, dreamy, aesthetic with gentle pinks and lavenders' },
  { id: 'neon', label: 'Neon', icon: Zap, gradient: 'from-cyan-400 to-pink-500', prompt: 'cyberpunk neon, electric, glowing brights against dark backgrounds' },
  { id: 'nature', label: 'Earthy', icon: Leaf, gradient: 'from-green-400 to-emerald-600', prompt: 'natural, earthy, forest with greens and organic textures' },
  { id: 'minimal', label: 'Minimal', icon: Sun, gradient: 'from-slate-300 to-slate-500', prompt: 'minimal, clean, modern with monochrome palette and sharp edges' },
  { id: 'cozy', label: 'Cozy', icon: Coffee, gradient: 'from-amber-400 to-orange-600', prompt: 'warm, cozy, autumn with warm oranges and browns' },
] as const;

const INTEREST_THEMES: Record<string, string> = {
  Gaming: 'cyberpunk gaming with neon RGB and dark backgrounds',
  Music: 'music festival aesthetic with vibrant gradients',
  Art: 'artistic creative palette with bold abstract patterns',
  Photography: 'minimal camera aesthetic with neutral tones',
  Sports: 'energetic athletic vibes with bold primaries',
  Fashion: 'high fashion editorial blacks with gold accents',
  Travel: 'wanderlust sunset with warm oranges',
  Food: 'fresh culinary aesthetic with appetizing warm colors',
  Fitness: 'powerful gym aesthetic with intense reds and greens',
  Reading: 'cozy library with warm amber tones',
  Movies: 'cinematic dramatic darks with spotlight effects',
  Technology: 'futuristic tech with electric blues and sleek surfaces',
  Nature: 'organic forest with natural greens and earthy textures',
  Animals: 'playful pet-friendly soft pastels',
  Dance: 'dance floor energy with purple and pink',
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

const BUILD_PHASES = [
  { label: 'Reading your vibe', icon: Sparkles, duration: 700 },
  { label: 'Mixing your palette', icon: Palette, duration: 800 },
  { label: 'Choosing typography', icon: Type, duration: 600 },
  { label: 'Tuning motion', icon: Zap, duration: 600 },
  { label: 'Polishing details', icon: Heart, duration: 500 },
];

type Step = 'vibe' | 'style' | 'building' | 'preview';

const SNAPSHOT_PROPS = [
  '--background', '--foreground', '--primary', '--secondary', '--accent',
  '--muted', '--card', '--border', '--input', '--ring',
  '--primary-foreground', '--secondary-foreground', '--accent-foreground',
  '--muted-foreground', '--card-foreground',
];

function isValidTheme(t: any): t is GeneratedTheme {
  if (!t || typeof t !== 'object') return false;
  // Accept the edge function's camelCase shape (colorPrimary/bgMain/textPrimary)
  // as well as legacy CSS-var/nested shapes.
  const hasPrimary =
    typeof t.colorPrimary === 'string' ||
    typeof t['--primary'] === 'string' ||
    typeof t.primary === 'string' ||
    typeof t.tokens?.['--primary'] === 'string' ||
    typeof t.tokens?.colorPrimary === 'string';
  return hasPrimary;
}

export function AIVybeDesigner({ interests = [], onComplete, onSkip }: AIVybeDesignerProps) {
  const { user } = useAuth();
  const saveTheme = useSaveTheme();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>('vibe');
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [selectedFont, setSelectedFont] = useState<FontPairingKey | null>(null);
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationPresetKey | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [buildPhase, setBuildPhase] = useState(0);
  const [generatedTheme, setGeneratedTheme] = useState<GeneratedTheme | null>(null);
  const [showPreviewElements, setShowPreviewElements] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Record<string, string> | null>(null);
  const mountedRef = useRef(true);

  // Capture theme snapshot on mount, abort + restore nav on unmount
  useEffect(() => {
    mountedRef.current = true;
    navVisibility.setInDesigner(true);

    try {
      const styles = getComputedStyle(document.documentElement);
      const snap: Record<string, string> = {};
      SNAPSHOT_PROPS.forEach(p => {
        snap[p] = styles.getPropertyValue(p).trim();
      });
      snapshotRef.current = snap;
    } catch (e) {
      console.warn('[AIVybeDesigner] snapshot failed', e);
      snapshotRef.current = null;
    }

    return () => {
      mountedRef.current = false;
      navVisibility.setInDesigner(false);
      try { abortRef.current?.abort(); } catch {}
    };
  }, []);

  // Build phase timer with proper cleanup
  useEffect(() => {
    if (step !== 'building') return;
    setBuildPhase(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    BUILD_PHASES.forEach((phase, i) => {
      acc += phase.duration;
      timers.push(setTimeout(() => {
        if (mountedRef.current) setBuildPhase(Math.min(i + 1, BUILD_PHASES.length - 1));
      }, acc));
    });

    return () => { timers.forEach(clearTimeout); };
  }, [step]);

  const restoreSnapshot = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) {
      try { resetThemeToDefault(); } catch {}
      return;
    }
    try {
      const root = document.documentElement;
      Object.entries(snap).forEach(([prop, value]) => {
        if (value) root.style.setProperty(prop, value);
      });
    } catch (e) {
      console.warn('[AIVybeDesigner] restore failed, resetting to default', e);
      try { resetThemeToDefault(); } catch {}
    }
  }, []);

  const interestSuggestion = useMemo(() => {
    const match = interests.find(i => INTEREST_THEMES[i]);
    return match ? INTEREST_THEMES[match] : null;
  }, [interests]);

  const generateTheme = async () => {
    const vibePrompt = selectedVibe
      ? PERSONALITY_VIBES.find(v => v.id === selectedVibe)?.prompt
      : '';
    const fontPref = selectedFont ? `Use ${FONT_PAIRINGS[selectedFont].description} typography` : '';
    const animPref = selectedAnimation ? `Use ${ANIMATION_PRESETS[selectedAnimation].description} motion` : '';

    const fullPrompt = [
      customPrompt.trim(),
      vibePrompt,
      interestSuggestion,
      fontPref,
      animPref,
      'Create a stunning theme. Ensure excellent contrast — text must always be readable.',
    ].filter(Boolean).join('. ');

    if (!fullPrompt.trim() || (!selectedVibe && !customPrompt.trim())) {
      toast.error('Pick a vibe or describe your style first');
      return;
    }

    setStep('building');
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const minBuildTime = BUILD_PHASES.reduce((sum, p) => sum + p.duration, 0);
    const buildStart = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke('generate-advanced-theme', {
        body: {
          prompt: fullPrompt,
          interests,
          includeFont: true,
          includeEffects: true,
          selectedFont,
          selectedAnimation,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const theme = data?.theme as GeneratedTheme | undefined;
      if (!isValidTheme(theme)) throw new Error('Invalid theme response');

      // Apply font + motion presets if user picked them
      if (selectedFont) {
        try {
          const fonts = FONT_PAIRINGS[selectedFont];
          await loadGoogleFonts([fonts.body, fonts.display]);
          applyFontFamily(fonts.body, fonts.display);
          theme.fontFamily = fonts.body;
          theme.fontDisplay = fonts.display;
        } catch (e) { console.warn('font apply failed', e); }
      }
      if (selectedAnimation) {
        try {
          const anim = ANIMATION_PRESETS[selectedAnimation];
          applyAnimationSettings(anim.speed, anim.style);
          theme.animationSpeed = anim.speed as any;
          theme.animationStyle = anim.style as any;
        } catch (e) { console.warn('animation apply failed', e); }
      }

      // Wait for the build animation to finish for a satisfying reveal
      const elapsed = Date.now() - buildStart;
      const remaining = Math.max(0, minBuildTime - elapsed);
      await new Promise(r => setTimeout(r, remaining));

      if (!mountedRef.current) return;

      // Apply the theme and reveal preview
      try { applyThemeTokens(theme); } catch (e) {
        console.error('applyThemeTokens failed', e);
        restoreSnapshot();
        toast.error("Couldn't apply that theme. Try another.");
        setStep('vibe');
        return;
      }

      setGeneratedTheme(theme);
      setStep('preview');
      // Stagger preview cards in after the step transition settles
      setTimeout(() => mountedRef.current && setShowPreviewElements(true), 250);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[AIVybeDesigner] generation failed', err);
      if (mountedRef.current) {
        toast.error('Could not generate theme. Try a different vibe.');
        setStep('vibe');
      }
    }
  };

  const handleKeep = async () => {
    if (!generatedTheme) { onComplete(); return; }
    try {
      await saveTheme.mutateAsync({
        themeTokens: generatedTheme,
        themeName: generatedTheme.themeName || 'My VYBE',
        basePreset: 'custom',
        silent: true,
      });
    } catch (e) {
      console.error('save theme failed', e);
      toast.error('Could not save theme');
    } finally {
      onComplete();
    }
  };

  const handleTryAgain = () => {
    restoreSnapshot();
    setGeneratedTheme(null);
    setShowPreviewElements(false);
    setBuildPhase(0);
    setStep('vibe');
  };

  const handleRevert = () => {
    restoreSnapshot();
    onComplete();
  };

  // Animation variants — respect reduced motion
  const stepVariants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
        exit: { opacity: 0, y: -10, transition: { duration: 0.25, ease: EASE_OUT_EXPO } },
      };

  // Step ordering for HUD
  const stepOrder = ['vibe', 'style', 'building', 'preview'] as const;
  const stepIndex = step === 'building' ? 2 : stepOrder.indexOf(step);
  const stepLabels = ['VIBE', 'STYLE', 'PREVIEW'] as const;

  // Particle positions (stable across renders)
  const particles = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      id: i,
      top: `${(i * 9.7) % 100}%`,
      left: `${(i * 17.3) % 100}%`,
      delay: `${(i * 0.7) % 5}s`,
      duration: `${5 + (i % 4)}s`,
    })),
    []
  );

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      {/* === FORGE BACKDROP === */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {/* Deep space gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(ellipse at 50% 100%, hsl(var(--accent) / 0.14), transparent 55%), hsl(var(--background))',
          }}
        />
        {/* Perspective grid floor */}
        {!reduceMotion && (
          <div className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden opacity-60">
            <div className="vybe-forge-grid" />
          </div>
        )}
        {/* Counter-rotating conic auroras */}
        <motion.div
          className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] rounded-full blur-[120px] opacity-25"
          style={{
            background:
              'conic-gradient(from 0deg, hsl(var(--primary) / 0.7), transparent 40%, hsl(var(--accent) / 0.5), transparent 80%, hsl(var(--primary) / 0.7))',
          }}
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 w-[120%] h-[120%] rounded-full blur-[120px] opacity-20"
          style={{
            background:
              'conic-gradient(from 180deg, hsl(var(--accent) / 0.6), transparent 50%, hsl(var(--primary) / 0.4))',
          }}
          animate={reduceMotion ? undefined : { rotate: -360 }}
          transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
        />
        {/* Floating particles */}
        {!reduceMotion && particles.map(p => (
          <span
            key={p.id}
            className="vybe-forge-particle"
            style={{ top: p.top, left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
          />
        ))}
        {/* Scan line during build */}
        {step === 'building' && !reduceMotion && <div className="vybe-forge-scan" />}
        {/* Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60" />
      </div>

      {/* === HUD: top progress chevrons === */}
      <div className="absolute top-0 inset-x-0 z-20 px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <span className="vybe-forge-chip shrink-0">VYBE · FORGE</span>
          <div className="flex-1 flex items-center gap-1.5">
            {stepLabels.map((label, i) => {
              const active = i === Math.min(stepIndex, 2);
              const passed = i < Math.min(stepIndex, 2);
              return (
                <div key={label} className="flex-1 flex items-center gap-1.5">
                  <motion.div
                    layout
                    className={cn(
                      'h-1.5 flex-1 rounded-sm transition-all',
                      active
                        ? 'bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_hsl(var(--primary)/0.7)]'
                        : passed
                        ? 'bg-primary/60'
                        : 'bg-muted/30'
                    )}
                    animate={{ scaleY: active ? 1.6 : 1 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  />
                </div>
              );
            })}
          </div>
          <span className="vybe-forge-chip shrink-0 tabular-nums">
            {String(Math.min(stepIndex + 1, 3)).padStart(2, '0')}/03
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1 — VIBE */}
        {step === 'vibe' && (
          <motion.div
            key="vibe"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pt-20 pb-5 max-w-md mx-auto w-full"
          >
            {/* === HERO ORB === */}
            <div className="relative flex flex-col items-center mb-5 mt-1">
              <div className="relative w-[120px] h-[120px] flex items-center justify-center">
                {/* Orbital rings */}
                {!reduceMotion && (
                  <>
                    <div className="absolute inset-[-14px] vybe-forge-ring" />
                    <div className="absolute inset-[-26px] vybe-forge-ring-rev" />
                  </>
                )}
                {/* Orb */}
                <motion.div
                  layoutId="vybe-orb"
                  className="vybe-forge-orb w-[110px] h-[110px] rounded-full flex items-center justify-center"
                  transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                >
                  <Wand2 className="h-7 w-7 text-primary-foreground drop-shadow-[0_0_8px_hsl(var(--primary))]" />
                </motion.div>
              </div>
              <div className="text-center mt-4">
                <span className="vybe-forge-chip">[ 01 / SIGNAL ]</span>
                <h1 className="text-2xl sm:text-[28px] font-bold text-foreground mt-2 tracking-tight">
                  Design Your VYBE
                </h1>
                <p className="text-xs text-muted-foreground mt-1 font-mono tracking-wide">
                  // select a frequency to tune the system
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain -mx-1 px-1">
              {/* Vibe constellation */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {PERSONALITY_VIBES.map((vibe, idx) => {
                  const Icon = vibe.icon;
                  const isSelected = selectedVibe === vibe.id;
                  return (
                    <motion.button
                      key={vibe.id}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.04, duration: 0.4, ease: EASE_OUT_EXPO }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setSelectedVibe(isSelected ? null : vibe.id)}
                      className={cn(
                        'group relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all min-h-[78px]',
                        isSelected ? 'bg-primary/10' : 'hover:bg-card/40'
                      )}
                    >
                      {/* Orbital ring on selection */}
                      {isSelected && !reduceMotion && (
                        <motion.div
                          layoutId="vibe-select-ring"
                          className="absolute inset-x-2 top-1.5 h-12 rounded-full ring-2 ring-primary shadow-[0_0_18px_hsl(var(--primary)/0.7)] pointer-events-none"
                          transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                        />
                      )}
                      <div
                        className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br shadow-lg transition-transform',
                          vibe.gradient,
                          isSelected ? 'scale-110' : 'group-hover:scale-105'
                        )}
                        style={{
                          boxShadow: isSelected
                            ? '0 0 24px hsl(var(--primary) / 0.5), inset 0 0 12px rgba(255,255,255,0.2)'
                            : '0 4px 16px rgba(0,0,0,0.3)',
                        }}
                      >
                        <Icon className="h-5 w-5 text-white drop-shadow-md" />
                      </div>
                      <span className={cn(
                        'text-[10px] font-mono uppercase tracking-wider transition-colors',
                        isSelected ? 'text-primary font-bold' : 'text-muted-foreground'
                      )}>
                        {vibe.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Neural input terminal */}
              <div className="mt-3 vybe-forge-panel rounded-xl p-3.5">
                <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/80 mb-2 flex items-center gap-1.5">
                  <span className="vybe-forge-caret">// neural input</span>
                  <span className="ml-auto text-muted-foreground/60">optional</span>
                </label>
                <Textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value.slice(0, 200))}
                  placeholder="describe your dream vybe..."
                  className="min-h-[70px] resize-none bg-background/40 border-primary/20 focus-visible:border-primary/60 focus-visible:ring-primary/30 text-sm font-mono"
                />
                <div className="text-[10px] font-mono text-muted-foreground/70 text-right mt-1 tabular-nums">
                  {String(customPrompt.length).padStart(3, '0')} / 200
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              {onSkip && (
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  className="text-muted-foreground rounded-full h-11 px-5 font-mono text-xs uppercase tracking-wider"
                >
                  Skip
                </Button>
              )}
              <Button
                onClick={() => setStep('style')}
                disabled={!selectedVibe && !customPrompt.trim()}
                className="flex-1 rounded-full h-11 font-mono text-xs uppercase tracking-[0.2em] bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_24px_-4px_hsl(var(--primary)/0.7)] border border-primary/40"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 2 — STYLE (font + motion combined) */}
        {step === 'style' && (
          <motion.div
            key="style"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pt-20 pb-5 max-w-md mx-auto w-full"
          >
            <div className="flex flex-col items-center mb-5">
              <div className="relative w-[88px] h-[88px] flex items-center justify-center mb-3">
                {!reduceMotion && <div className="absolute inset-[-10px] vybe-forge-ring" />}
                <motion.div
                  layoutId="vybe-orb"
                  className="vybe-forge-orb w-[78px] h-[78px] rounded-full flex items-center justify-center"
                  transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                >
                  <Sparkles className="h-5 w-5 text-primary-foreground drop-shadow-[0_0_8px_hsl(var(--primary))]" />
                </motion.div>
              </div>
              <span className="vybe-forge-chip">[ 02 / CALIBRATION ]</span>
              <h1 className="text-2xl sm:text-[28px] font-bold text-foreground tracking-tight mt-2">
                Calibrate the system
              </h1>
              <p className="text-xs text-muted-foreground mt-1 font-mono tracking-wide">
                // tune typography &amp; motion signature
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain -mx-1 px-1 space-y-4">
              <section className="vybe-forge-panel rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_12px_hsl(var(--primary)/0.4)]">
                    <Type className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground">Typography</h2>
                </div>
                <FontSelector selectedFont={selectedFont} onSelect={setSelectedFont} />
              </section>

              <section className="vybe-forge-panel rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center shadow-[0_0_12px_hsl(var(--accent)/0.4)]">
                    <Zap className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-foreground">Motion Signature</h2>
                </div>
                <AnimationSelector selectedAnimation={selectedAnimation} onSelect={setSelectedAnimation} />
              </section>
            </div>

            <div className="flex gap-2 pt-3">
              <Button
                variant="ghost"
                onClick={() => setStep('vibe')}
                className="rounded-full h-11 px-5 text-muted-foreground font-mono text-xs uppercase tracking-wider"
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={generateTheme}
                className="flex-1 rounded-full h-11 font-mono text-xs uppercase tracking-[0.2em] bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_28px_-4px_hsl(var(--primary)/0.8)] border border-primary/40"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Forge VYBE
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 3 — BUILDING */}
        {step === 'building' && (
          <motion.div
            key="building"
            {...stepVariants}
            className="relative z-10 h-full"
          >
            <VybeGenerationAnimation
              isGenerating
              buildPhase={buildPhase}
              phases={BUILD_PHASES}
            />
          </motion.div>
        )}

        {/* STEP 4 — PREVIEW */}
        {step === 'preview' && (
          <motion.div
            key="preview"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pt-20 pb-5 max-w-md mx-auto w-full"
          >
            <div className="text-center mb-4 relative">
              {/* Reveal flash */}
              <div className="vybe-forge-flash absolute inset-0 pointer-events-none" />
              <div className="relative w-[110px] h-[110px] mx-auto flex items-center justify-center mb-3">
                {!reduceMotion && (
                  <>
                    <div className="absolute inset-[-12px] vybe-forge-ring" />
                    <div className="absolute inset-[-22px] vybe-forge-ring-rev" />
                  </>
                )}
                <motion.div
                  layoutId="vybe-orb"
                  className="vybe-forge-orb w-[100px] h-[100px] rounded-full flex items-center justify-center"
                  transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                >
                  <Check className="h-7 w-7 text-primary-foreground drop-shadow-[0_0_10px_hsl(var(--primary))]" strokeWidth={3} />
                </motion.div>
              </div>
              <span className="vybe-forge-chip">[ 03 / DEPLOYED ]</span>
              <h1 className="text-2xl font-bold text-foreground mt-2 tracking-tight">
                {generatedTheme?.themeName || 'Your VYBE'}
              </h1>
              <p className="text-xs text-muted-foreground mt-1 font-mono tracking-wide">
                // signal locked — preview live
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain space-y-3">
              {/* Mock feed card */}
              <motion.div
                initial={{ opacity: 0, y: 16, rotateX: -6 }}
                animate={showPreviewElements ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                className="vybe-forge-panel rounded-2xl p-4"
                style={{ boxShadow: '0 0 30px -10px hsl(var(--primary) / 0.4)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent shadow-[0_0_18px_hsl(var(--primary)/0.6)]" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">Your Feed</div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">// preview · live</div>
                  </div>
                </div>
                <div className="h-20 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/20" />
              </motion.div>

              {/* Mock buttons */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT_EXPO }}
                className="flex gap-2"
              >
                <Button className="flex-1 font-semibold">Primary</Button>
                <Button variant="outline" className="flex-1 font-semibold">Secondary</Button>
              </motion.div>

              {/* Color palette */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.16, ease: EASE_OUT_EXPO }}
                className="vybe-forge-panel rounded-2xl p-4"
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2.5">// palette</div>
                <div className="flex gap-2">
                  {[
                    { c: 'bg-primary', label: 'Primary' },
                    { c: 'bg-secondary', label: 'Secondary' },
                    { c: 'bg-accent', label: 'Accent' },
                    { c: 'bg-muted', label: 'Muted' },
                  ].map(s => (
                    <div key={s.label} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className={cn('w-full h-10 rounded-xl shadow-sm ring-1 ring-foreground/10', s.c)} />
                      <span className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">{s.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Font preview */}
              {generatedTheme?.fontFamily && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={showPreviewElements ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.24, ease: EASE_OUT_EXPO }}
                  className="vybe-forge-panel rounded-2xl p-4 text-center"
                >
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">// typography</div>
                  <div
                    className="text-xl font-bold text-foreground"
                    style={{ fontFamily: `'${generatedTheme.fontDisplay || generatedTheme.fontFamily}', system-ui` }}
                  >
                    {generatedTheme.fontDisplay || generatedTheme.fontFamily}
                  </div>
                </motion.div>
              )}
            </div>

            <div className="pt-3 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTryAgain}
                  className="flex-1 rounded-full h-11 font-mono text-[11px] uppercase tracking-[0.18em] border-primary/30"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Recalibrate
                </Button>
                <Button
                  onClick={handleKeep}
                  disabled={saveTheme.isPending}
                  className="flex-[2] rounded-full h-11 font-mono text-[11px] uppercase tracking-[0.2em] bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_28px_-4px_hsl(var(--primary)/0.8)] border border-primary/40"
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {saveTheme.isPending ? 'Deploying…' : 'Deploy VYBE'}
                </Button>
              </div>
              <button
                onClick={handleRevert}
                className="w-full text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                // revert to previous theme
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VybeMiniIcon size={1} className="sr-only" />
    </div>
  );
}
