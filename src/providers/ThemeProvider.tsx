import { createContext, useEffect, useState, ReactNode } from 'react';
import { useApplyUserTheme, useUserTheme, ThemeTokens, useApplyActiveBackground } from '@/hooks/useCustomTheme';
import { BackgroundEffects } from '@/components/effects/BackgroundEffects';

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<null>(null);

export function CustomThemeProvider({ children }: ThemeProviderProps) {
  const { data: userTheme } = useUserTheme();
  const [bgEffect, setBgEffect] = useState<ThemeTokens['backgroundEffect']>('none');
  
  // Apply user's custom theme on mount and when it changes
  useApplyUserTheme();
  
  // Load and apply active background from database
  useApplyActiveBackground();
  
  // Update background effect when theme changes
  useEffect(() => {
    if (userTheme?.is_active && userTheme.theme_tokens) {
      const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
      setBgEffect(tokens.backgroundEffect || 'none');
    } else {
      setBgEffect('none');
    }
  }, [userTheme]);

  return (
    <ThemeContext.Provider value={null}>
      <BackgroundEffects effect={bgEffect || 'none'} />
      {children}
    </ThemeContext.Provider>
  );
}
