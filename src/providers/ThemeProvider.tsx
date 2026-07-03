import { createContext, ReactNode, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApplyUserTheme } from '@/hooks/useCustomTheme';
import { hydrateThemeFromLocalCaches, kickstartThemeHydration, reconcileUserThemeCache, readRememberedThemeUserId } from '@/lib/themeHydration';
import { getStoredAuthUserId } from '@/lib/legacyAuthStorage';
import { reinforceSplashTheme } from '@/lib/theme/themePrepaint';

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
    if (typeof document !== 'undefined' && document.body.classList.contains('splash-visible')) {
      reinforceSplashTheme();
    }

    const uid = getStoredAuthUserId() ?? readRememberedThemeUserId();
    const bootPainted =
      typeof document !== 'undefined' &&
      document.documentElement.hasAttribute('data-vybe-theme-painted');

    if (bootPainted) {
      reconcileUserThemeCache(queryClient, uid);
    } else {
      hydrateThemeFromLocalCaches(queryClient, uid);
    }
    kickstartThemeHydration(queryClient);
  }, [queryClient]);

  useApplyUserTheme();

  return (
    <ThemeContext.Provider value={null}>
      {children}
    </ThemeContext.Provider>
  );
}
