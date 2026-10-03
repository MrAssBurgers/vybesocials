import { createContext, useContext, useEffect, useState, ReactNode, ComponentProps } from 'react';
import { MotionConfig } from 'framer-motion';
import { getHapticsEnabled, setHapticsEnabled as setHapticsStorage } from '@/lib/haptics';
import { getSoundsEnabled, setSoundsEnabled as setSoundsStorage } from '@/lib/sounds';
import { subscribeDevicePreference, useDevicePreference } from '@/lib/devicePreferences';
import { reinforceSplashTheme } from '@/lib/theme/themePrepaint';
import { defaultGlassIntensity, GLASS_INTENSITIES } from '@/lib/visualPreferences';
import '@/styles/accessibility-motion.css';

const THEMES = ['dark', 'light', 'system'] as const;
const MOTION_INTENSITIES = ['calm', 'normal'] as const;
// Preserve saved boolean preferences from earlier versions.
const MOTION_PREFERENCES = ['system', 'true', 'false'] as const;
type Theme = typeof THEMES[number];
type MotionIntensity = typeof MOTION_INTENSITIES[number];
type GlassIntensity = typeof GLASS_INTENSITIES[number];

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
  reducedMotion: boolean;
  setReducedMotion: (reduced: boolean) => void;
  followsSystemMotion: boolean;
  followSystemMotion: () => void;
  motionIntensity: MotionIntensity;
  setMotionIntensity: (intensity: MotionIntensity) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
  soundsEnabled: boolean;
  setSoundsEnabled: (enabled: boolean) => void;
  glassIntensity: GlassIntensity;
  setGlassIntensity: (intensity: GlassIntensity) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function useMediaPreference(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches : fallback);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useDevicePreference('xd-theme', 'dark', THEMES);
  const [motionPreference, setMotionPreference] = useDevicePreference('xd-reduced-motion', 'system', MOTION_PREFERENCES);
  const [motionIntensity, setMotionIntensity] = useDevicePreference('vybe-motion-intensity', 'normal', MOTION_INTENSITIES);
  const [glassIntensity, setGlassIntensity] = useDevicePreference('vybe-glass-intensity', defaultGlassIntensity(), GLASS_INTENSITIES);
  const [hapticsEnabled, setHapticsEnabledState] = useState(getHapticsEnabled);
  const [soundsEnabled, setSoundsEnabledState] = useState(getSoundsEnabled);
  const systemDark = useMediaPreference('(prefers-color-scheme: dark)', true);
  const systemReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)', false);
  const followsSystemMotion = motionPreference === 'system';
  // An operating-system accessibility request always takes precedence.
  const reducedMotion = systemReducedMotion || motionPreference === 'true';
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains(resolvedTheme)) {
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
      if (document.body.classList.contains('splash-visible')) reinforceSplashTheme();
    }
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle('calm-motion', motionIntensity === 'calm');
  }, [motionIntensity]);

  useEffect(() => subscribeDevicePreference('vybe-haptics-enabled', () => setHapticsEnabledState(getHapticsEnabled())), []);
  useEffect(() => subscribeDevicePreference('vybe-sound-settings', () => setSoundsEnabledState(getSoundsEnabled())), []);

  const setHapticsEnabled = (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    setHapticsStorage(enabled);
  };
  const setSoundsEnabled = (enabled: boolean) => {
    setSoundsEnabledState(enabled);
    setSoundsStorage(enabled);
  };

  return (
    <ThemeContext.Provider value={{
      theme, resolvedTheme, setTheme, reducedMotion,
      setReducedMotion: (reduced) => setMotionPreference(reduced ? 'true' : 'system'),
      followsSystemMotion, followSystemMotion: () => setMotionPreference('system'),
      motionIntensity, setMotionIntensity, hapticsEnabled, setHapticsEnabled,
      soundsEnabled, setSoundsEnabled, glassIntensity, setGlassIntensity,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** The in-app accessibility setting also governs Framer Motion transforms. */
export function ThemeMotionConfig(props: ComponentProps<typeof MotionConfig>) {
  const { reducedMotion } = useTheme();
  return <MotionConfig {...props} reducedMotion={reducedMotion ? 'always' : 'never'} />;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
