import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getHapticsEnabled, setHapticsEnabled as setHapticsStorage } from '@/lib/haptics';
import { getSoundsEnabled, setSoundsEnabled as setSoundsStorage } from '@/lib/sounds';

type Theme = 'dark' | 'light' | 'system';
type MotionIntensity = 'calm' | 'normal';
type GlassIntensity = 'calm' | 'normal' | 'max';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
  reducedMotion: boolean;
  setReducedMotion: (reduced: boolean) => void;
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

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSystemReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('xd-theme') as Theme) || 'dark';
  });

  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('xd-reduced-motion');
    return stored ? stored === 'true' : getSystemReducedMotion();
  });

  const [motionIntensity, setMotionIntensityState] = useState<MotionIntensity>(() => {
    if (typeof window === 'undefined') return 'normal';
    return (localStorage.getItem('vybe-motion-intensity') as MotionIntensity) || 'normal';
  });

  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(() => {
    return getHapticsEnabled();
  });

  const [soundsEnabled, setSoundsEnabledState] = useState<boolean>(() => {
    return getSoundsEnabled();
  });

  const [glassIntensity, setGlassIntensityState] = useState<GlassIntensity>(() => {
    if (typeof window === 'undefined') return 'normal';
    return (localStorage.getItem('vybe-glass-intensity') as GlassIntensity) || 'normal';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    if (theme === 'system') return getSystemTheme();
    return theme;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    // Only mutate the class list when the mode actually changes.
    // Blindly calling remove()+add() on every render fires the MutationObserver
    // in useApplyUserTheme, which re-applies tokens and causes visible color
    // flicker / "colors keep changing" on navigation.
    const currentMode = root.classList.contains('light') ? 'light' : 'dark';
    if (currentMode !== resolved) {
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
    }
    localStorage.setItem('xd-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    
    if (reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    localStorage.setItem('xd-reduced-motion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    const root = window.document.documentElement;
    
    if (motionIntensity === 'calm') {
      root.classList.add('calm-motion');
    } else {
      root.classList.remove('calm-motion');
    }
    localStorage.setItem('vybe-motion-intensity', motionIntensity);
  }, [motionIntensity]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-glass-intensity', glassIntensity);
    localStorage.setItem('vybe-glass-intensity', glassIntensity);
  }, [glassIntensity]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(resolved);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setReducedMotion = (reduced: boolean) => {
    setReducedMotionState(reduced);
  };

  const setMotionIntensity = (intensity: MotionIntensity) => {
    setMotionIntensityState(intensity);
  };

  const setHapticsEnabled = (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    setHapticsStorage(enabled);
  };

  const setSoundsEnabled = (enabled: boolean) => {
    setSoundsEnabledState(enabled);
    setSoundsStorage(enabled);
  };

  const setGlassIntensity = (intensity: GlassIntensity) => {
    setGlassIntensityState(intensity);
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      resolvedTheme, 
      setTheme, 
      reducedMotion, 
      setReducedMotion,
      motionIntensity,
      setMotionIntensity,
      hapticsEnabled,
      setHapticsEnabled,
      soundsEnabled,
      setSoundsEnabled,
      glassIntensity,
      setGlassIntensity,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
