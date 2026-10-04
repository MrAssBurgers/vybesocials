import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { useTheme } from '@/lib/theme';

interface AccessibilityState {
  reduceMotion: boolean;
  prefersContrast: boolean;
}

const AccessibilityContext = createContext<AccessibilityState>({
  reduceMotion: false,
  prefersContrast: false,
});

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useTheme();
  const [prefersContrast, setPrefersContrast] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-contrast: more)').matches : false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');
    
    const updateContrast = (e: MediaQueryListEvent | MediaQueryList) => {
      setPrefersContrast(e.matches);
      document.documentElement.classList.toggle('high-contrast', e.matches);
    };

    // Initial check
    updateContrast(contrastQuery);

    // Listen for changes
    contrastQuery.addEventListener('change', updateContrast);

    return () => {
      contrastQuery.removeEventListener('change', updateContrast);
      document.documentElement.classList.remove('high-contrast');
    };
  }, []);

  return (
    // ThemeProvider owns the shared CSS class. A second media listener could
    // remove it while the user's saved in-app preference still requires it.
    <AccessibilityContext.Provider value={{ reduceMotion: reducedMotion || isNativePerfMode(), prefersContrast }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

/**
 * Hook to get animation props based on reduce motion preference
 */
export function useAnimationProps() {
  const { reduceMotion } = useAccessibility();
  
  if (reduceMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  
  return {};
}
