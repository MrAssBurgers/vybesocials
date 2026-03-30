/**
 * AppBackground - Persistent background image layer
 * 
 * CRITICAL: This component renders a fixed, full-viewport background that:
 * - Is NEVER unmounted or re-rendered by navigation
 * - Is NEVER affected by theme color changes
 * - Sits at the LOWEST z-index (0) in the app
 * - All UI content renders ABOVE this layer
 * 
 * The background image state is stored in a dedicated context to prevent
 * theme changes from accidentally clearing or overriding it.
 */

import { createContext, useContext, useState, useCallback, useEffect, memo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface BackgroundState {
  imageUrl: string | null;
  opacity: number;
  blur: number;
}

interface BackgroundContextType {
  background: BackgroundState;
  setBackgroundImage: (url: string | null) => void;
  setBackgroundOpacity: (opacity: number) => void;
  setBackgroundBlur: (blur: number) => void;
  refreshBackground: () => Promise<void>;
}

const BackgroundContext = createContext<BackgroundContextType | null>(null);

export function useAppBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) {
    throw new Error('useAppBackground must be used within AppBackgroundProvider');
  }
  return ctx;
}

// Safe version that returns null if not in provider (for optional usage)
export function useAppBackgroundSafe() {
  return useContext(BackgroundContext);
}

// Memoized background layer - only re-renders when background state changes
const BackgroundLayer = memo(function BackgroundLayer({ background }: { background: BackgroundState }) {
  if (!background.imageUrl) {
    return null;
  }

  return (
    <div
      id="app-background-layer"
      aria-hidden="true"
      style={{
        position: 'fixed',
        // Extend beyond viewport to prevent blur edge artifacts
        top: background.blur > 0 ? `-${background.blur * 2}px` : 0,
        left: background.blur > 0 ? `-${background.blur * 2}px` : 0,
        right: background.blur > 0 ? `-${background.blur * 2}px` : 0,
        bottom: background.blur > 0 ? `-${background.blur * 2}px` : 0,
        zIndex: 0,
        backgroundImage: `url(${background.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        opacity: background.opacity,
        filter: background.blur > 0 ? `blur(${background.blur}px)` : undefined,
        pointerEvents: 'none',
        transform: 'translateZ(0)',
        willChange: 'auto',
      }}
    />
  );
});

export function AppBackgroundProvider({ children }: { children: ReactNode }) {
  const [background, setBackground] = useState<BackgroundState>({
    imageUrl: null,
    opacity: 0.85,
    blur: 0,
  });

  // Background is now profile-only — do NOT auto-load globally.
  // Profile pages set the background via setBackgroundImage when viewing a profile.
  const refreshBackground = useCallback(async () => {
    // No-op: backgrounds are managed by profile pages only
  }, []);

  const setBackgroundImage = useCallback((url: string | null) => {
    setBackground(prev => ({ ...prev, imageUrl: url }));
    // Update data attribute for CSS fallback
    document.documentElement.dataset.hasBgImage = url ? 'true' : 'false';
  }, []);

  const setBackgroundOpacity = useCallback((opacity: number) => {
    setBackground(prev => ({ ...prev, opacity }));
  }, []);

  const setBackgroundBlur = useCallback((blur: number) => {
    setBackground(prev => ({ ...prev, blur }));
  }, []);

  const contextValue: BackgroundContextType = {
    background,
    setBackgroundImage,
    setBackgroundOpacity,
    setBackgroundBlur,
    refreshBackground,
  };

  return (
    <BackgroundContext.Provider value={contextValue}>
      {/* Background layer - ALWAYS rendered at lowest z-index */}
      <BackgroundLayer background={background} />
      {/* All app content renders above */}
      {children}
    </BackgroundContext.Provider>
  );
}
