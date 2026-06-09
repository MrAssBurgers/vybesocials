/**
 * AppBackground - Native CSS background system
 * 
 * Sets the user's custom background directly on document.body via inline styles.
 * No overlay div, no z-index layering, no transparency hacks.
 * The browser's native background-image on <body> is the most efficient approach.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getSignedUrl, needsSigning } from '@/lib/signedUrlCache';
import { THEME_IMAGES } from '@/lib/cosmeticConstants';
import { stripLiquidShellDocumentState } from '@/lib/liquidShellState';

interface BackgroundState {
  imageUrl: string | null;
  opacity: number;
  blur: number;
}

interface BackgroundContextType {
  background: BackgroundState;
  /** True only for Settings → Background uploads, not equipped profile themes */
  hasUserWallpaper: boolean;
  isBackgroundResolved: boolean;
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

/** Analyze image luminance by sampling canvas pixels */
function analyzeLuminance(imageUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64; // Small sample for performance
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(0.5); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let totalLum = 0;
        const pixelCount = size * size;
        for (let i = 0; i < data.length; i += 4) {
          // Relative luminance (sRGB)
          totalLum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        }
        resolve(totalLum / pixelCount);
      } catch {
        resolve(0.5);
      }
    };
    img.onerror = () => resolve(0.5);
    img.src = imageUrl;
  });
}

/** Apply or clear background styles on document.body */
function applyBodyBackground(state: BackgroundState) {
  const { imageUrl, opacity, blur } = state;
  const body = document.body;

  if (!imageUrl) {
    body.style.background = '';
    body.style.backgroundImage = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.backgroundRepeat = '';
    body.style.backgroundAttachment = '';
    body.style.removeProperty('--bg-opacity');
    body.style.removeProperty('--bg-blur');
    document.documentElement.dataset.hasBgImage = 'false';
    document.documentElement.style.removeProperty('--bg-luminance');
    body.classList.remove('has-custom-bg');
    return;
  }

  // Custom wallpaper wins — tear down aurora / touch document state immediately
  stripLiquidShellDocumentState();

  // Clear the shorthand first so the CSS gradient doesn't interfere
  body.style.background = 'none';
  body.style.backgroundImage = `url(${imageUrl})`;
  body.style.backgroundSize = 'cover';
  body.style.backgroundPosition = 'center center';
  body.style.backgroundRepeat = 'no-repeat';
  // Use 'scroll' on mobile (fixed is broken on iOS/Android) and 'fixed' on desktop
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  body.style.backgroundAttachment = isMobile ? 'scroll' : 'fixed';
  document.documentElement.dataset.hasBgImage = 'true';
  body.classList.add('has-custom-bg');

  // Use CSS custom properties for opacity/blur so a pseudo-element can handle them
  body.style.setProperty('--bg-opacity', String(opacity));
  body.style.setProperty('--bg-blur', `${blur}px`);
  
  // Analyze luminance for auto-contrast
  analyzeLuminance(imageUrl).then(lum => {
    document.documentElement.style.setProperty('--bg-luminance', String(lum));
    // Set contrast mode: light bg needs dark text boost, dark bg needs light text boost
    document.documentElement.dataset.bgContrast = lum > 0.55 ? 'light' : lum < 0.35 ? 'dark' : 'mid';
  });
}

function clearBodyBackground() {
  applyBodyBackground({ imageUrl: null, opacity: 1, blur: 0 });
}

/**
 * Hard reset of body background styles — used by the X button in Background
 * settings so the user instantly sees the default platform gradient even
 * before React state propagates.
 */
export function hardResetBodyBackground() {
  clearBodyBackground();
}

export function AppBackgroundProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [background, setBackground] = useState<BackgroundState>({
    imageUrl: null,
    opacity: 0.85,
    blur: 0,
  });
  const [hasUserWallpaper, setHasUserWallpaper] = useState(false);
  const [isBackgroundResolved, setIsBackgroundResolved] = useState(false);
  const hasLoadedRef = useRef(false);
  const rawUrlRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Monotonic token: every apply/refresh increments. Stale async resolutions
  // (e.g. slow signed-URL fetches that finish after the user has navigated
  // away from a foreign profile) are dropped if the token has moved on.
  const applyTokenRef = useRef(0);

  // Sign the raw URL and update state
  const signAndApply = useCallback(async (rawUrl: string | null, token: number) => {
    if (!rawUrl) {
      if (token !== applyTokenRef.current) return;
      setBackground(prev => ({ ...prev, imageUrl: null }));
      return;
    }
    if (needsSigning(rawUrl)) {
      const signed = await getSignedUrl(rawUrl);
      if (token !== applyTokenRef.current) return; // stale — drop
      setBackground(prev => ({ ...prev, imageUrl: signed }));
    } else {
      if (token !== applyTokenRef.current) return;
      setBackground(prev => ({ ...prev, imageUrl: rawUrl }));
    }
  }, []);

  // Load the LOGGED-IN user's own background and apply it globally
  // (home, messages, settings, etc). Profile pages may temporarily override
  // when viewing other users; they should call refreshBackground() on unmount
  // to restore the owner's background.
  const refreshBackground = useCallback(async () => {
    const token = ++applyTokenRef.current;
    const profileId = profile?.id;
    if (!profileId) {
      rawUrlRef.current = null;
      hasLoadedRef.current = false;
      setHasUserWallpaper(false);
      setBackground(prev => ({ ...prev, imageUrl: null }));
      clearBodyBackground();
      setIsBackgroundResolved(true);
      return;
    }

    setIsBackgroundResolved(false);
    setHasUserWallpaper(false);

    // 1. Equipped profile themes are profile cosmetics — do not replace the app-shell aurora
    const equippedTheme = (profile as unknown as { equipped_profile_theme?: string | null })?.equipped_profile_theme;
    if (equippedTheme && THEME_IMAGES[equippedTheme]) {
      rawUrlRef.current = null;
      setHasUserWallpaper(false);
      setBackground(prev => ({ ...prev, imageUrl: null }));
      clearBodyBackground();
      setIsBackgroundResolved(true);
      return;
    }

    // 2. Active user_backgrounds upload — explicit custom wallpaper; hides liquid aurora
    try {
      const { data, error } = await supabase
        .from('user_backgrounds')
        .select('image_url')
        .eq('user_id', profileId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) {
          console.warn('[AppBackground] user_backgrounds query failed:', error.message);
        }
        if (token !== applyTokenRef.current) return;
        rawUrlRef.current = null;
        setHasUserWallpaper(false);
        setBackground(prev => ({ ...prev, imageUrl: null }));
        setIsBackgroundResolved(true);
        return;
      }

      const url = data?.image_url ?? null;
      rawUrlRef.current = url;
      setHasUserWallpaper(Boolean(url));
      await signAndApply(url, token);
      hasLoadedRef.current = true;
      setIsBackgroundResolved(true);
    } catch {
      if (token !== applyTokenRef.current) return;
      rawUrlRef.current = null;
      setHasUserWallpaper(false);
      setBackground(prev => ({ ...prev, imageUrl: null }));
      setIsBackgroundResolved(true);
    }
  }, [profile, signAndApply]);

  // Auto-load own background whenever auth/profile changes
  useEffect(() => {
    refreshBackground();
  }, [refreshBackground]);

  // Re-sign every 45 minutes to prevent expiry
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      if (rawUrlRef.current && needsSigning(rawUrlRef.current)) {
        signAndApply(rawUrlRef.current, ++applyTokenRef.current);
      }
    }, 45 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [signAndApply]);

  // Apply body styles whenever background state changes
  useEffect(() => {
    applyBodyBackground(background);
  }, [background]);

  // Clear on unmount (logout / provider removed)
  useEffect(() => {
    return () => clearBodyBackground();
  }, []);

  const setBackgroundImage = useCallback((url: string | null) => {
    rawUrlRef.current = url;
    setHasUserWallpaper(url !== null);
    const token = ++applyTokenRef.current;
    if (url === null) {
      clearBodyBackground();
    } else {
      stripLiquidShellDocumentState();
    }
    signAndApply(url, token);
  }, [signAndApply]);

  const setBackgroundOpacity = useCallback((opacity: number) => {
    setBackground(prev => ({ ...prev, opacity }));
  }, []);

  const setBackgroundBlur = useCallback((blur: number) => {
    setBackground(prev => ({ ...prev, blur }));
  }, []);

  const contextValue: BackgroundContextType = {
    background,
    hasUserWallpaper,
    isBackgroundResolved,
    setBackgroundImage,
    setBackgroundOpacity,
    setBackgroundBlur,
    refreshBackground,
  };

  return (
    <BackgroundContext.Provider value={contextValue}>
      {children}
    </BackgroundContext.Provider>
  );
}
