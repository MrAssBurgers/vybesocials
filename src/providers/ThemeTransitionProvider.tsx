import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { NanotechSwoosh } from '@/components/effects/NanotechSwoosh';

interface ThemeTransitionContextType {
  triggerTransition: (primaryColor?: string, accentColor?: string, onMidpoint?: () => void) => void;
  isTransitioning: boolean;
}

const ThemeTransitionContext = createContext<ThemeTransitionContextType | undefined>(undefined);

interface ThemeTransitionProviderProps {
  children: ReactNode;
}

interface TransitionState {
  isActive: boolean;
  primaryColor: string;
  accentColor: string;
  onMidpoint?: () => void;
}

/**
 * Global theme transition provider
 * Provides a swoosh animation effect that can be triggered from anywhere in the app
 * when changing themes.
 */
export function ThemeTransitionProvider({ children }: ThemeTransitionProviderProps) {
  const [transition, setTransition] = useState<TransitionState>({
    isActive: false,
    primaryColor: '280 70% 50%',
    accentColor: '330 80% 60%',
  });

  const triggerTransition = useCallback((
    primaryColor = '280 70% 50%',
    accentColor = '330 80% 60%',
    onMidpoint?: () => void
  ) => {
    setTransition({
      isActive: true,
      primaryColor,
      accentColor,
      onMidpoint,
    });
  }, []);

  const handleMidpoint = useCallback(() => {
    transition.onMidpoint?.();
  }, [transition.onMidpoint]);

  const handleComplete = useCallback(() => {
    setTransition(prev => ({
      ...prev,
      isActive: false,
      onMidpoint: undefined,
    }));
  }, []);

  return (
    <ThemeTransitionContext.Provider 
      value={{ 
        triggerTransition, 
        isTransitioning: transition.isActive 
      }}
    >
      {children}
      <NanotechSwoosh
        isActive={transition.isActive}
        primaryColor={transition.primaryColor}
        accentColor={transition.accentColor}
        onMidpoint={handleMidpoint}
        onComplete={handleComplete}
        duration={700}
      />
    </ThemeTransitionContext.Provider>
  );
}

export function useThemeTransition() {
  const context = useContext(ThemeTransitionContext);
  if (context === undefined) {
    throw new Error('useThemeTransition must be used within a ThemeTransitionProvider');
  }
  return context;
}
