import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { NanotechSwoosh } from '@/components/effects/NanotechSwoosh';
import { useTheme } from '@/lib/theme';
import { usePlatformContext } from '@/providers/PlatformProvider';

interface ThemeTransitionContextType {
  triggerTransition: (primaryColor?: string, accentColor?: string, onMidpoint?: () => void) => void;
  isTransitioning: boolean;
}

const ThemeTransitionContext = createContext<ThemeTransitionContextType | undefined>(undefined);

interface TransitionState {
  id: number;
  primaryColor: string;
  accentColor: string;
}

export function ThemeTransitionProvider({ children }: { children: ReactNode }) {
  const { reducedMotion, motionIntensity } = useTheme();
  const { isLowPerformance } = usePlatformContext();
  const staticFeedback = reducedMotion || isLowPerformance;
  const calm = motionIntensity === 'calm';
  const duration = calm ? 180 : 420;
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const sequence = useRef(0);

  const triggerTransition = useCallback((
    primaryColor = '280 70% 50%',
    accentColor = '330 80% 60%',
    onMidpoint?: () => void,
  ) => {
    // Apply now: an animation must never queue a stale theme write or delay a save.
    // Keep the callback name for existing consumers; it is no longer timer-driven.
    onMidpoint?.();
    setTransition(staticFeedback ? null : { id: ++sequence.current, primaryColor, accentColor });
  }, [staticFeedback]);

  useEffect(() => {
    if (!transition) return;
    if (staticFeedback) {
      setTransition(null);
      return;
    }
    const timer = setTimeout(() => {
      setTransition(current => current?.id === transition.id ? null : current);
    }, duration);
    return () => clearTimeout(timer);
  }, [transition, duration, staticFeedback]);

  return (
    <ThemeTransitionContext.Provider value={{ triggerTransition, isTransitioning: !!transition && !staticFeedback }}>
      {children}
      {transition && !staticFeedback && (
        <NanotechSwoosh
          key={transition.id}
          primaryColor={transition.primaryColor}
          accentColor={transition.accentColor}
          calm={calm}
          duration={duration}
        />
      )}
    </ThemeTransitionContext.Provider>
  );
}

export function useThemeTransition() {
  const context = useContext(ThemeTransitionContext);
  if (context === undefined) throw new Error('useThemeTransition must be used within a ThemeTransitionProvider');
  return context;
}
