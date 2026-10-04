/**
 * AppBackground - Native CSS background system
 * 
 * Sets the user's custom background directly on document.body via inline styles.
 * No overlay div, no z-index layering, no transparency hacks.
 * The browser's native background-image on <body> is the most efficient approach.
 */

import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef, ReactNode } from 'react';
import { loadUserBackgrounds } from '@/lib/userBackgroundRepository';
import { useBackgroundAccount } from '@/hooks/useBackgroundAccount';
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
let bodyBackgroundVersion = 0;
function applyBodyBackground(state: BackgroundState) {
  const version = ++bodyBackgroundVersion;
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
    delete document.documentElement.dataset.bgContrast;
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
    if (version !== bodyBackgroundVersion) return;
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
  const { profile } = useAuth();
  const { account, isCurrent } = useBackgroundAccount();
  const [background, setBackground] = useState<BackgroundState>({ imageUrl: null, opacity: 0.85, blur: 0 });
  const [hasUserWallpaper, setHasUserWallpaper] = useState(false);
  const [isBackgroundResolved, setIsBackgroundResolved] = useState(false);
  const rawUrlRef = useRef<string | null>(null);
  const applyTokenRef = useRef(0);
  const stateOwnerRef = useRef(account);
  const sameAccount = stateOwnerRef.current === account;
  const equippedTheme = (profile as { equipped_profile_theme?: string | null } | null)?.equipped_profile_theme;

  const signAndApply = useCallback(async (rawUrl: string | null, token: number) => {
    const url = rawUrl && needsSigning(rawUrl) ? await getSignedUrl(rawUrl) : rawUrl;
    if (!isCurrent() || token !== applyTokenRef.current) return;
    setBackground(prev => ({ ...prev, imageUrl: url }));
  }, [isCurrent]);

  const refreshBackground = useCallback(async () => {
    if (!isCurrent()) return;
    const token = ++applyTokenRef.current;
    const current = () => isCurrent() && token === applyTokenRef.current;
    try {
      const rows = account.authUid && account.profileId && !(equippedTheme && THEME_IMAGES[equippedTheme])
        ? await loadUserBackgrounds(account) : [];
      // Check before touching the raw URL too: the refresh timer reuses it.
      if (!current()) return;
      const url = rows.find(row => row.is_active)?.image_url ?? null;
      rawUrlRef.current = url;
      setHasUserWallpaper(Boolean(url));
      await signAndApply(url, token);
      if (current()) setIsBackgroundResolved(true);
    } catch {
      if (!current()) return;
      rawUrlRef.current = null;
      setHasUserWallpaper(false);
      setBackground(prev => ({ ...prev, imageUrl: null }));
      setIsBackgroundResolved(true);
    }
  }, [account, equippedTheme, isCurrent, signAndApply]);

  useLayoutEffect(() => {
    stateOwnerRef.current = account;
    ++applyTokenRef.current;
    rawUrlRef.current = null;
    setBackground({ imageUrl: null, opacity: 0.85, blur: 0 });
    setHasUserWallpaper(false);
    setIsBackgroundResolved(false);
    clearBodyBackground();
    return () => { ++applyTokenRef.current; rawUrlRef.current = null; clearBodyBackground(); };
  }, [account]);

  useEffect(() => { void refreshBackground(); }, [refreshBackground]);
  useEffect(() => {
    const timer = setInterval(() => {
      const raw = rawUrlRef.current;
      if (isCurrent() && raw && needsSigning(raw)) {
        void signAndApply(raw, ++applyTokenRef.current).catch(() => { /* Retain current image until next refresh. */ });
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isCurrent, signAndApply]);
  useLayoutEffect(() => {
    if (sameAccount) applyBodyBackground(background);
  }, [background, sameAccount]);

  const setBackgroundImage = useCallback((url: string | null) => {
    if (!isCurrent()) return;
    rawUrlRef.current = url;
    setHasUserWallpaper(Boolean(url));
    const token = ++applyTokenRef.current;
    if (!url) clearBodyBackground();
    else stripLiquidShellDocumentState();
    void signAndApply(url, token).catch(() => {
      if (!isCurrent() || token !== applyTokenRef.current) return;
      setBackground(prev => ({ ...prev, imageUrl: null }));
    });
  }, [isCurrent, signAndApply]);
  const setBackgroundOpacity = useCallback((opacity: number) => {
    if (isCurrent()) setBackground(prev => ({ ...prev, opacity }));
  }, [isCurrent]);
  const setBackgroundBlur = useCallback((blur: number) => {
    if (isCurrent()) setBackground(prev => ({ ...prev, blur }));
  }, [isCurrent]);

  return <BackgroundContext.Provider value={{
    background: sameAccount ? background : { imageUrl: null, opacity: 0.85, blur: 0 },
    hasUserWallpaper: sameAccount && hasUserWallpaper,
    isBackgroundResolved: sameAccount && isBackgroundResolved,
    setBackgroundImage, setBackgroundOpacity, setBackgroundBlur, refreshBackground,
  }}>{children}</BackgroundContext.Provider>;
}
