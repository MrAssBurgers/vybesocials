import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isNativePerfMode } from '@/lib/nativePerfMode';

interface AccessibilityState {
  reduceMotion: boolean;
  prefersContrast: boolean;
}

const AccessibilityContext = createContext<AccessibilityState>({
  reduceMotion: false,
  prefersContrast: false,
});

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessibilityState>({
    reduceMotion: false,
    prefersContrast: false,
  });

  useEffect(() => {
    // Check for reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');
    
    const updateMotion = (e: MediaQueryListEvent | MediaQueryList) => {
      const reduce = isNativePerfMode() || e.matches;
      setState(prev => ({ ...prev, reduceMotion: reduce }));
      document.documentElement.classList.toggle('reduce-motion', reduce);
    };
    
    const updateContrast = (e: MediaQueryListEvent | MediaQueryList) => {
      setState(prev => ({ ...prev, prefersContrast: e.matches }));
      document.documentElement.classList.toggle('high-contrast', e.matches);
    };

    // Initial check
    updateMotion(motionQuery);
    updateContrast(contrastQuery);

    // Listen for changes
    motionQuery.addEventListener('change', updateMotion);
    contrastQuery.addEventListener('change', updateContrast);

    return () => {
      motionQuery.removeEventListener('change', updateMotion);
      contrastQuery.removeEventListener('change', updateContrast);
    };
  }, []);

  return (
    <AccessibilityContext.Provider value={state}>
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
