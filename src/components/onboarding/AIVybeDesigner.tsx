import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkles,
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
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { applyThemeTokens, useSaveTheme, setThemePreviewLock, ThemeTokens } from '@/hooks/useCustomTheme';
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
const SPRING = { type: 'spring' as const, stiffness: 380, damping: 30 };

const PERSONALITY_VIBES = [
  { id: 'chill', label: 'Chill', tagline: 'calm waters', icon: Cloud, gradient: 'from-sky-400 to-cyan-500', glow: ['#38bdf8', '#06b6d4'], prompt: 'calm, peaceful, serene ocean vibes with soft blues and gentle motion' },
  { id: 'bold', label: 'Bold', tagline: 'full send', icon: Flame, gradient: 'from-orange-500 to-red-500', glow: ['#f97316', '#ef4444'], prompt: 'bold, energetic, vibrant with hot colors and dynamic effects' },
  { id: 'dark', label: 'Mysterious', tagline: 'after midnight', icon: Moon, gradient: 'from-purple-600 to-indigo-900', glow: ['#9333ea', '#312e81'], prompt: 'dark, mysterious, gothic with deep purples and subtle glow' },
  { id: 'pastel', label: 'Dreamy', tagline: 'soft focus', icon: Heart, gradient: 'from-pink-300 to-purple-400', glow: ['#f9a8d4', '#c084fc'], prompt: 'soft pastel, dreamy, aesthetic with gentle pinks and lavenders' },
  { id: 'neon', label: 'Neon', tagline: 'city lights', icon: Zap, gradient: 'from-cyan-400 to-pink-500', glow: ['#22d3ee', '#ec4899'], prompt: 'cyberpunk neon, electric, glowing brights against dark backgrounds' },
  { id: 'nature', label: 'Earthy', tagline: 'touch grass', icon: Leaf, gradient: 'from-green-400 to-emerald-600', glow: ['#4ade80', '#059669'], prompt: 'natural, earthy, forest with greens and organic textures' },
  { id: 'minimal', label: 'Minimal', tagline: 'less is more', icon: Sun, gradient: 'from-slate-300 to-slate-500', glow: ['#cbd5e1', '#64748b'], prompt: 'minimal, clean, modern with monochrome palette and sharp edges' },
  { id: 'cozy', label: 'Cozy', tagline: 'golden hour', icon: Coffee, gradient: 'from-amber-400 to-orange-600', glow: ['#fbbf24', '#ea580c'], prompt: 'warm, cozy, autumn with warm oranges and browns' },
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

// Curated local themes per vibe — used when the edge function is unreachable
// so the designer ALWAYS produces a theme.
const LOCAL_VIBE_THEMES: Record<string, GeneratedTheme> = {
  chill: {
    themeName: 'Ocean Drift', colorPrimary: '199 89% 56%', colorSecondary: '217 60% 18%', colorAccent: '174 72% 50%',
    bgMain: '215 50% 6%', bgCard: '215 45% 10%', bgGradientFrom: '215 55% 5%', bgGradientMid: '205 50% 9%', bgGradientTo: '190 45% 7%',
    textPrimary: '200 30% 96%', textSecondary: '205 20% 68%', borderColor: '210 40% 18%',
    neonPink: '330 80% 65%', neonPurple: '260 75% 65%', neonCyan: '185 95% 55%',
    borderRadius: 'large', mode: 'dark', animationSpeed: 'slow', animationStyle: 'smooth', backgroundEffect: 'bubbles',
  } as GeneratedTheme,
  bold: {
    themeName: 'Voltage Rush', colorPrimary: '16 100% 57%', colorSecondary: '350 85% 22%', colorAccent: '45 100% 55%',
    bgMain: '340 35% 6%', bgCard: '340 30% 10%', bgGradientFrom: '350 45% 5%', bgGradientMid: '20 50% 9%', bgGradientTo: '340 40% 6%',
    textPrimary: '20 30% 97%', textSecondary: '20 15% 70%', borderColor: '350 35% 18%',
    neonPink: '340 100% 60%', neonPurple: '280 90% 62%', neonCyan: '180 100% 50%',
    borderRadius: 'medium', mode: 'dark', animationSpeed: 'fast', animationStyle: 'bouncy', backgroundEffect: 'particles',
  } as GeneratedTheme,
  dark: {
    themeName: 'Violet Eclipse', colorPrimary: '270 85% 65%', colorSecondary: '260 45% 16%', colorAccent: '300 80% 60%',
    bgMain: '262 50% 5%', bgCard: '262 45% 9%', bgGradientFrom: '265 55% 4%', bgGradientMid: '280 50% 8%', bgGradientTo: '250 45% 6%',
    textPrimary: '270 25% 96%', textSecondary: '265 15% 66%', borderColor: '265 40% 17%',
    neonPink: '320 90% 62%', neonPurple: '275 95% 66%', neonCyan: '200 90% 58%',
    borderRadius: 'large', mode: 'dark', animationSpeed: 'normal', animationStyle: 'smooth', backgroundEffect: 'stars',
  } as GeneratedTheme,
  pastel: {
    themeName: 'Blush Reverie', colorPrimary: '330 80% 66%', colorSecondary: '315 35% 90%', colorAccent: '265 70% 70%',
    bgMain: '320 40% 97%', bgCard: '0 0% 100%', bgGradientFrom: '325 50% 98%', bgGradientMid: '300 45% 96%', bgGradientTo: '260 40% 97%',
    textPrimary: '325 35% 12%', textSecondary: '320 15% 42%', borderColor: '320 30% 88%',
    neonPink: '335 90% 62%', neonPurple: '275 80% 64%', neonCyan: '195 85% 55%',
    borderRadius: 'large', mode: 'light', animationSpeed: 'normal', animationStyle: 'smooth', backgroundEffect: 'aurora',
  } as GeneratedTheme,
  neon: {
    themeName: 'Neon District', colorPrimary: '180 100% 50%', colorSecondary: '280 60% 20%', colorAccent: '320 100% 60%',
    bgMain: '240 30% 5%', bgCard: '240 25% 9%', bgGradientFrom: '245 35% 4%', bgGradientMid: '270 35% 8%', bgGradientTo: '220 30% 6%',
    textPrimary: '200 30% 97%', textSecondary: '220 15% 68%', borderColor: '240 30% 17%',
    neonPink: '320 100% 60%', neonPurple: '275 95% 64%', neonCyan: '182 100% 52%',
    borderRadius: 'small', mode: 'dark', animationSpeed: 'fast', animationStyle: 'snappy', backgroundEffect: 'geometric',
  } as GeneratedTheme,
  nature: {
    themeName: 'Forest Pulse', colorPrimary: '152 65% 45%', colorSecondary: '150 35% 15%', colorAccent: '88 60% 52%',
    bgMain: '160 35% 5%', bgCard: '158 30% 9%', bgGradientFrom: '162 40% 4%', bgGradientMid: '150 35% 8%', bgGradientTo: '140 30% 6%',
    textPrimary: '140 25% 96%', textSecondary: '145 15% 66%', borderColor: '152 30% 16%',
    neonPink: '330 70% 62%', neonPurple: '265 60% 62%', neonCyan: '170 85% 48%',
    borderRadius: 'large', mode: 'dark', animationSpeed: 'slow', animationStyle: 'smooth', backgroundEffect: 'fireflies',
  } as GeneratedTheme,
  minimal: {
    themeName: 'Monochrome', colorPrimary: '0 0% 15%', colorSecondary: '0 0% 88%', colorAccent: '0 0% 40%',
    bgMain: '0 0% 99%', bgCard: '0 0% 100%', bgGradientFrom: '0 0% 100%', bgGradientMid: '0 0% 98%', bgGradientTo: '0 0% 97%',
    textPrimary: '0 0% 8%', textSecondary: '0 0% 42%', borderColor: '0 0% 88%',
    neonPink: '330 70% 60%', neonPurple: '265 60% 60%', neonCyan: '190 80% 50%',
    borderRadius: 'small', mode: 'light', animationSpeed: 'instant', animationStyle: 'snappy', backgroundEffect: 'none',
  } as GeneratedTheme,
  cozy: {
    themeName: 'Amber Hours', colorPrimary: '32 95% 55%', colorSecondary: '25 45% 16%', colorAccent: '14 80% 56%',
    bgMain: '24 35% 6%', bgCard: '24 30% 10%', bgGradientFrom: '26 40% 5%', bgGradientMid: '20 35% 9%', bgGradientTo: '32 30% 7%',
    textPrimary: '30 35% 96%', textSecondary: '28 18% 68%', borderColor: '26 30% 17%',
    neonPink: '345 80% 62%', neonPurple: '275 60% 62%', neonCyan: '180 75% 50%',
    borderRadius: 'large', mode: 'dark', animationSpeed: 'slow', animationStyle: 'smooth', backgroundEffect: 'fireflies',
  } as GeneratedTheme,
};

function buildLocalTheme(vibeId: string | null): GeneratedTheme {
  return { ...(LOCAL_VIBE_THEMES[vibeId || 'dark'] || LOCAL_VIBE_THEMES.dark) };
}

function isValidTheme(t: any): t is GeneratedTheme {
  if (!t || typeof t !== 'object') return false;
  const hasPrimary =
    typeof t.colorPrimary === 'string' ||
    typeof t['--primary'] === 'string' ||
    typeof t.primary === 'string' ||
    typeof t.tokens?.['--primary'] === 'string' ||
    typeof t.tokens?.colorPrimary === 'string';
  return hasPrimary;
}

/* ── Aurora backdrop — morphs to the selected vibe's colors ── */
function AuroraBackdrop({ colors, animate }: { colors: [string, string]; animate: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-background" />
      <motion.div
        className="absolute w-[70vw] h-[70vw] max-w-[560px] max-h-[560px] rounded-full blur-[100px]"
        style={{
          backgroundColor: colors[0],
          top: '-12%',
          left: '-18%',
          opacity: 0.32,
          transition: 'background-color 1.2s ease',
        }}
        animate={animate ? { x: [0, 36, -16, 0], y: [0, 26, 50, 0], scale: [1, 1.12, 0.96, 1] } : undefined}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[64vw] h-[64vw] max-w-[500px] max-h-[500px] rounded-full blur-[100px]"
        style={{
          backgroundColor: colors[1],
          bottom: '-14%',
          right: '-16%',
          opacity: 0.28,
          transition: 'background-color 1.2s ease',
        }}
        animate={animate ? { x: [0, -42, 14, 0], y: [0, -30, -54, 0], scale: [1, 0.94, 1.1, 1] } : undefined}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[46vw] h-[46vw] max-w-[380px] max-h-[380px] rounded-full blur-[90px]"
        style={{
          backgroundColor: colors[0],
          top: '38%',
          left: '32%',
          opacity: 0.14,
          transition: 'background-color 1.2s ease',
        }}
        animate={animate ? { x: [0, 26, -32, 0], y: [0, -38, 22, 0] } : undefined}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Fine grain + vignette for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/70" />
    </div>
  );
}

/* ── Animated headline — words rise in one by one ── */
function AnimatedHeadline({ words, className, reduceMotion }: { words: string[]; className?: string; reduceMotion: boolean | null }) {
  return (
    <h1 className={cn('flex flex-wrap justify-center gap-x-[0.3em] overflow-hidden', className)}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-1 -mb-1">
          <motion.span
            className="inline-block"
            initial={reduceMotion ? { opacity: 0 } : { y: '110%', opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            transition={{ delay: 0.12 + i * 0.07, duration: 0.6, ease: EASE_OUT_EXPO }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </h1>
  );
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

  useEffect(() => {
    mountedRef.current = true;
    navVisibility.setInDesigner(true);
    // While the designer is open, previewed tokens own the CSS variables —
    // block useApplyUserTheme from flickering the old saved theme back in.
    setThemePreviewLock(true);

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
      setThemePreviewLock(false);
      try { abortRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  // Lock background scroll while the designer overlay is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    if (step !== 'preview') {
      setShowPreviewElements(false);
      return;
    }
    if (reduceMotion) {
      setShowPreviewElements(true);
      return;
    }
    const t = window.setTimeout(() => {
      if (mountedRef.current) setShowPreviewElements(true);
    }, 250);
    return () => window.clearTimeout(t);
  }, [step, reduceMotion]);

  // Build phase timer
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
      try { resetThemeToDefault(); } catch { /* noop */ }
      return;
    }
    try {
      const root = document.documentElement;
      Object.entries(snap).forEach(([prop, value]) => {
        if (value) root.style.setProperty(prop, value);
      });
    } catch (e) {
      console.warn('[AIVybeDesigner] restore failed, resetting to default', e);
      try { resetThemeToDefault(); } catch { /* noop */ }
    }
  }, []);

  const interestSuggestion = useMemo(() => {
    const match = interests.find(i => INTEREST_THEMES[i]);
    return match ? INTEREST_THEMES[match] : null;
  }, [interests]);

  const activeVibe = useMemo(
    () => PERSONALITY_VIBES.find(v => v.id === selectedVibe) || null,
    [selectedVibe],
  );

  // Backdrop colors follow the selected vibe (defaults to brand purple/cyan)
  const auroraColors: [string, string] = activeVibe
    ? [activeVibe.glow[0], activeVibe.glow[1]]
    : ['#8b5cf6', '#06b6d4'];

  const generateTheme = async () => {
    const vibePrompt = activeVibe?.prompt || '';
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

    // Resolve a theme: try AI edge function, fall back to the curated local
    // palette for the selected vibe so the flow NEVER dead-ends.
    let theme: GeneratedTheme;
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

      const aiTheme = data?.theme as GeneratedTheme | undefined;
      if (!isValidTheme(aiTheme)) throw new Error('Invalid theme response');
      theme = aiTheme;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('[AIVybeDesigner] AI generation failed — using local theme', err);
      theme = buildLocalTheme(selectedVibe);
    }

    try {
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
          theme.animationSpeed = anim.speed as GeneratedTheme['animationSpeed'];
          theme.animationStyle = anim.style as GeneratedTheme['animationStyle'];
        } catch (e) { console.warn('animation apply failed', e); }
      }

      // Let the build animation play out for a satisfying reveal
      const elapsed = Date.now() - buildStart;
      const remaining = Math.max(0, minBuildTime - elapsed);
      await new Promise(r => setTimeout(r, remaining));

      if (!mountedRef.current) return;

      try { applyThemeTokens(theme); } catch (e) {
        console.error('applyThemeTokens failed', e);
        restoreSnapshot();
        toast.error("Couldn't apply that theme. Try another.");
        setStep('vibe');
        return;
      }

      setGeneratedTheme(theme);
      setStep('preview');
    } catch (err: unknown) {
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

  const stepVariants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
        exit: { opacity: 0, y: -14, scale: 0.99, transition: { duration: 0.25, ease: EASE_OUT_EXPO } },
      };

  const stepOrder = ['vibe', 'style', 'building', 'preview'] as const;
  const stepIndex = step === 'building' ? 2 : stepOrder.indexOf(step);
  const progressIndex = Math.min(stepIndex, 2);

  // Rendered in a portal: ancestors with CSS transforms (page transitions)
  // break `position: fixed`, which left the overlay scrolling with the page
  // and the app header visible on top of it.
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-background overflow-hidden overscroll-contain">
      <AuroraBackdrop colors={auroraColors} animate={!reduceMotion} />

      {/* ── Top bar: close + progress ── */}
      <div
        className="absolute top-0 inset-x-0 z-30 px-4"
        style={{ paddingTop: 'max(var(--sat, 0px), 0.875rem)' }}
      >
        <div className="max-w-md mx-auto flex items-center gap-3 h-10">
          {onSkip ? (
            <motion.button
              type="button"
              onClick={onSkip}
              aria-label="Close"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              whileTap={{ scale: 0.9 }}
              className="h-9 w-9 shrink-0 rounded-full bg-foreground/[0.06] backdrop-blur-md border border-foreground/[0.08] flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-foreground/[0.1] transition-colors"
            >
              <X className="h-4 w-4" />
            </motion.button>
          ) : <div className="w-9 shrink-0" />}

          {/* Progress segments */}
          <div className="flex-1 flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex-1 h-1 rounded-full bg-foreground/[0.08] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  initial={false}
                  animate={{ width: i < progressIndex ? '100%' : i === progressIndex ? '100%' : '0%', opacity: i === progressIndex ? 1 : i < progressIndex ? 0.55 : 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                />
              </div>
            ))}
          </div>

          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground/40">
            {progressIndex + 1}/3
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ════ STEP 1 — PICK A VIBE ════ */}
        {step === 'vibe' && (
          <motion.div
            key="vibe"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pb-5 max-w-md mx-auto w-full"
            style={{ paddingTop: 'calc(max(var(--sat, 0px), 0.875rem) + 3.5rem)' }}
          >
            <div className="text-center mb-3.5">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground/[0.06] border border-foreground/[0.08] text-[11px] font-semibold text-foreground/70 backdrop-blur-md"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                AI Theme Designer
              </motion.span>
              <AnimatedHeadline
                words={["What's", 'your', 'vybe?']}
                reduceMotion={reduceMotion}
                className="text-[27px] leading-[1.05] font-bold tracking-tight text-foreground mt-2"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.5 }}
                className="text-[13px] text-muted-foreground mt-1"
              >
                Pick a mood and we'll design your whole app around it.
              </motion.p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-1">
              <div className="grid grid-cols-4 gap-1.5">
                {PERSONALITY_VIBES.map((vibe, idx) => {
                  const Icon = vibe.icon;
                  const isSelected = selectedVibe === vibe.id;
                  return (
                    <motion.button
                      key={vibe.id}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.26 + idx * 0.04, ...SPRING }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setSelectedVibe(isSelected ? null : vibe.id)}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-2xl overflow-hidden transition-colors duration-300 border backdrop-blur-md',
                        isSelected
                          ? 'border-primary/60 bg-foreground/[0.07]'
                          : 'border-foreground/[0.07] bg-foreground/[0.03] hover:bg-foreground/[0.06]',
                      )}
                    >
                      {/* Glow wash inside the card when selected */}
                      <div
                        className={cn(
                          'absolute -top-4 inset-x-2 h-14 rounded-full blur-xl bg-gradient-to-br transition-opacity duration-500',
                          vibe.gradient,
                          isSelected ? 'opacity-40' : 'opacity-0',
                        )}
                      />
                      <div
                        className={cn(
                          'relative w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg transition-transform duration-300',
                          vibe.gradient,
                          isSelected && 'scale-110',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] text-white drop-shadow" />
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0, rotate: -90 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              transition={SPRING}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_10px_hsl(var(--primary)/0.7)] ring-2 ring-background"
                            >
                              <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3.5} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <span className={cn('relative text-[11px] font-semibold leading-none transition-colors', isSelected ? 'text-foreground' : 'text-foreground/75')}>
                        {vibe.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Custom prompt */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62, duration: 0.5, ease: EASE_OUT_EXPO }}
                className="mt-2.5 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] backdrop-blur-md p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">Or describe it</span>
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">{customPrompt.length}/200</span>
                </div>
                <Textarea
                  value={customPrompt}
                  rows={1}
                  onChange={e => {
                    setCustomPrompt(e.target.value.slice(0, 200));
                    // Auto-grow so the box is never internally scrollable —
                    // keeps mouse-wheel scrolling working over the textarea
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                  placeholder="cherry cola sunset, y2k chrome, rainy tokyo at 2am…"
                  className="min-h-[36px] h-[36px] resize-none overflow-hidden bg-transparent border-0 p-0 focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
                />
              </motion.div>
            </div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5, ease: EASE_OUT_EXPO }}
              className="flex gap-2 pt-3"
            >
              {onSkip && (
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  className="rounded-full h-12 px-5 text-muted-foreground font-medium"
                >
                  Skip
                </Button>
              )}
              <Button
                onClick={() => setStep('style')}
                disabled={!selectedVibe && !customPrompt.trim()}
                className="relative flex-1 rounded-full h-12 text-[15px] font-bold overflow-hidden bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] text-primary-foreground shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.7)] disabled:opacity-40 animate-[gradient-x_4s_ease_infinite]"
              >
                Continue
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* ════ STEP 2 — STYLE ════ */}
        {step === 'style' && (
          <motion.div
            key="style"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pb-5 max-w-md mx-auto w-full"
            style={{ paddingTop: 'calc(max(var(--sat, 0px), 0.875rem) + 3.5rem)' }}
          >
            <div className="text-center mb-3.5">
              <AnimatedHeadline
                words={['Make', 'it', 'yours']}
                reduceMotion={reduceMotion}
                className="text-[27px] leading-[1.05] font-bold tracking-tight text-foreground"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-[13px] text-muted-foreground mt-1"
              >
                Typography and motion — both optional, both worth it.
              </motion.p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain -mx-1 px-1 space-y-3.5 pb-2">
              <motion.section
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5, ease: EASE_OUT_EXPO }}
                className="rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] backdrop-blur-md p-4"
              >
                <FontSelector selectedFont={selectedFont} onSelect={setSelectedFont} />
              </motion.section>

              <motion.section
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38, duration: 0.5, ease: EASE_OUT_EXPO }}
                className="rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] backdrop-blur-md p-4"
              >
                <AnimationSelector selectedAnimation={selectedAnimation} onSelect={setSelectedAnimation} />
              </motion.section>
            </div>

            <div className="flex gap-2 pt-3">
              <Button
                variant="ghost"
                onClick={() => setStep('vibe')}
                className="rounded-full h-12 px-5 text-muted-foreground font-medium"
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={generateTheme}
                className="flex-1 rounded-full h-12 text-[15px] font-bold bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] text-primary-foreground shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.7)] animate-[gradient-x_4s_ease_infinite]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate my VYBE
              </Button>
            </div>
          </motion.div>
        )}

        {/* ════ STEP 3 — BUILDING ════ */}
        {step === 'building' && (
          <motion.div key="building" {...stepVariants} className="relative z-10 h-full">
            <VybeGenerationAnimation isGenerating buildPhase={buildPhase} phases={BUILD_PHASES} />
          </motion.div>
        )}

        {/* ════ STEP 4 — PREVIEW ════ */}
        {step === 'preview' && (
          <motion.div
            key="preview"
            {...stepVariants}
            className="relative z-10 h-full flex flex-col px-5 pb-5 max-w-md mx-auto w-full"
            style={{ paddingTop: 'calc(max(var(--sat, 0px), 0.875rem) + 3.25rem)' }}
          >
            <div className="text-center mb-4">
              <motion.div
                initial={reduceMotion ? false : { scale: 0, rotate: -120 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
                className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_36px_-6px_hsl(var(--primary)/0.8)] mb-3"
              >
                <Check className="h-7 w-7 text-primary-foreground" strokeWidth={3} />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5, ease: EASE_OUT_EXPO }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Say hello to</span>
                <h1 className="text-[30px] leading-tight font-bold tracking-tight text-foreground mt-0.5">
                  {generatedTheme?.themeName || 'Your VYBE'}
                </h1>
              </motion.div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 pb-2">
              {/* Mock feed card in the new theme */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
                animate={
                  showPreviewElements || reduceMotion
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 24, scale: 0.96 }
                }
                transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
                className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_12px_40px_-16px_hsl(var(--primary)/0.45)]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent shadow-[0_0_16px_hsl(var(--primary)/0.5)]" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">Your feed, reimagined</div>
                    <div className="text-[11px] text-muted-foreground">live preview</div>
                  </div>
                  <div className="h-7 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center">Follow</div>
                </div>
                <div className="h-20 rounded-xl bg-gradient-to-br from-primary/25 via-accent/20 to-primary/10 border border-border/40" />
                <div className="flex gap-3 mt-3">
                  <div className="h-2 w-16 rounded-full bg-muted" />
                  <div className="h-2 w-10 rounded-full bg-muted/70" />
                  <div className="h-2 flex-1 rounded-full bg-muted/40" />
                </div>
              </motion.div>

              {/* Buttons */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={
                  showPreviewElements || reduceMotion
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 20 }
                }
                transition={{ duration: 0.5, delay: 0.08, ease: EASE_OUT_EXPO }}
                className="flex gap-2"
              >
                <Button className="flex-1 font-semibold rounded-xl">Primary</Button>
                <Button variant="outline" className="flex-1 font-semibold rounded-xl">Secondary</Button>
              </motion.div>

              {/* Palette swatches pop in */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={
                  showPreviewElements || reduceMotion
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 20 }
                }
                transition={{ duration: 0.5, delay: 0.16, ease: EASE_OUT_EXPO }}
                className="rounded-2xl border border-border/60 bg-card p-4"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your palette</div>
                <div className="flex gap-2">
                  {[
                    { c: 'bg-primary', label: 'Primary' },
                    { c: 'bg-secondary', label: 'Secondary' },
                    { c: 'bg-accent', label: 'Accent' },
                    { c: 'bg-muted', label: 'Muted' },
                  ].map((s, i) => (
                    <div key={s.label} className="flex-1 flex flex-col items-center gap-1.5">
                      <motion.div
                        initial={reduceMotion ? false : { scale: 0 }}
                        animate={
                          showPreviewElements || reduceMotion ? { scale: 1 } : { scale: 0 }
                        }
                        transition={{ delay: 0.24 + i * 0.07, ...SPRING }}
                        className={cn('w-full h-11 rounded-xl shadow-sm ring-1 ring-foreground/10', s.c)}
                      />
                      <span className="text-[9px] font-medium uppercase text-muted-foreground tracking-wider">{s.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Font preview */}
              {generatedTheme?.fontFamily && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={
                    showPreviewElements || reduceMotion
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 20 }
                  }
                  transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
                  className="rounded-2xl border border-border/60 bg-card p-4 text-center"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Typography</div>
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
                  className="flex-1 rounded-full h-12 font-semibold border-border"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Remix
                </Button>
                <Button
                  onClick={handleKeep}
                  disabled={saveTheme.isPending}
                  className="flex-[2] rounded-full h-12 text-[15px] font-bold bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] text-primary-foreground shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.7)] animate-[gradient-x_4s_ease_infinite]"
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {saveTheme.isPending ? 'Saving…' : 'Keep this VYBE'}
                </Button>
              </div>
              <button
                onClick={handleRevert}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
              >
                Revert to my previous theme
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
