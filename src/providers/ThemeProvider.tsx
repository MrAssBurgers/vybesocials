import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useApplyUserTheme } from '@/hooks/useCustomTheme';

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<null>(null);

export function CustomThemeProvider({ children }: ThemeProviderProps) {
  // Apply user's custom theme on mount and when it changes
  useApplyUserTheme();

  return (
    <ThemeContext.Provider value={null}>
      {children}
    </ThemeContext.Provider>
  );
}
