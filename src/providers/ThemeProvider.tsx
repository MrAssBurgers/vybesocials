import { createContext, ReactNode, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApplyUserTheme } from '@/hooks/useCustomTheme';
import { hydrateThemeFromLocalCaches } from '@/lib/themeHydration';

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<null>(null);

/**
 * CustomThemeProvider - Manages UI theme colors.
 * Animated backdrop is a single global layer (AppGlobalLiquidShell / VybeLiquidBackground).
 */
export function CustomThemeProvider({ children }: ThemeProviderProps) {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    hydrateThemeFromLocalCaches(queryClient);
  }, [queryClient]);

  useApplyUserTheme();

  return (
    <ThemeContext.Provider value={null}>
      {children}
    </ThemeContext.Provider>
  );
}
