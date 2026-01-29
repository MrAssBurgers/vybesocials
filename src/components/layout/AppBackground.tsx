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

import { createContext, useContext, useState, useEffect, useCallback, memo, ReactNode } from 'react';
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
        inset: 0,
        zIndex: 0,
        backgroundImage: `url(${background.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        opacity: background.opacity,
        filter: background.blur > 0 ? `blur(${background.blur}px)` : undefined,
        pointerEvents: 'none',
        // Prevent any transforms or transitions from affecting this layer
        transform: 'translateZ(0)',
        willChange: 'auto',
      }}
    />
  );
});

export function AppBackgroundProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [background, setBackground] = useState<BackgroundState>({
    imageUrl: null,
    opacity: 0.85,
    blur: 0,
  });

  // Load active background from database
  const refreshBackground = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // First try to get active background
      let { data: activeBg } = await supabase
        .from('user_backgrounds')
        .select('id, image_url')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();

      // If no active background, fall back to most recent
      if (!activeBg?.image_url) {
        const { data: latestBg } = await supabase
          .from('user_backgrounds')
          .select('id, image_url')
          .eq('user_id', profile.id)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestBg?.image_url) {
          activeBg = latestBg;
          // Repair DB state (non-blocking)
          try {
            await supabase.rpc('set_active_background', { p_background_id: latestBg.id });
          } catch {
            // Ignore - non-critical
          }
        }
      }

      if (activeBg?.image_url) {
        setBackground(prev => ({
          ...prev,
          imageUrl: activeBg.image_url,
        }));
        // Set data attribute for CSS fallback
        document.documentElement.dataset.hasBgImage = 'true';
        console.log('[AppBackground] Applied background:', activeBg.image_url);
      } else {
        // No background
        document.documentElement.dataset.hasBgImage = 'false';
      }
    } catch (error) {
      console.error('[AppBackground] Failed to load background:', error);
    }
  }, [profile?.id]);

  // Load background on mount and when profile changes
  useEffect(() => {
    refreshBackground();
  }, [refreshBackground]);

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
