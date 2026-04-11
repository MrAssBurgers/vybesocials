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
    // Remove the pseudo-element opacity/blur layer
    body.classList.remove('has-custom-bg');
    return;
  }

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
}

function clearBodyBackground() {
  applyBodyBackground({ imageUrl: null, opacity: 1, blur: 0 });
}

export function AppBackgroundProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [background, setBackground] = useState<BackgroundState>({
    imageUrl: null,
    opacity: 0.85,
    blur: 0,
  });
  const hasLoadedRef = useRef(false);
  const rawUrlRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sign the raw URL and update state
  const signAndApply = useCallback(async (rawUrl: string | null) => {
    if (!rawUrl) {
      setBackground(prev => ({ ...prev, imageUrl: null }));
      return;
    }
    if (needsSigning(rawUrl)) {
      const signed = await getSignedUrl(rawUrl);
      setBackground(prev => ({ ...prev, imageUrl: signed }));
    } else {
      setBackground(prev => ({ ...prev, imageUrl: rawUrl }));
    }
  }, []);

  // Auto-load user's active background on auth
  const refreshBackground = useCallback(async () => {
    const profileId = profile?.id;
    if (!profileId) return;
    
    try {
      // First try the active background
      const { data } = await supabase
        .from('user_backgrounds')
        .select('id, image_url')
        .eq('user_id', profileId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (data?.image_url) {
        rawUrlRef.current = data.image_url;
        await signAndApply(data.image_url);
        hasLoadedRef.current = true;
        return;
      }
      
      // Fallback: no active background - try the most recent one and repair
      const { data: latestBg } = await supabase
        .from('user_backgrounds')
        .select('id, image_url')
        .eq('user_id', profileId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestBg?.image_url) {
        rawUrlRef.current = latestBg.image_url;
        await signAndApply(latestBg.image_url);
        hasLoadedRef.current = true;
        // Best-effort repair: mark it active
        supabase
          .from('user_backgrounds')
          .update({ is_active: true })
          .eq('id', latestBg.id)
          .then(() => {});
        return;
      }
      
      // No backgrounds at all
      if (!hasLoadedRef.current) {
        rawUrlRef.current = null;
        setBackground(prev => ({ ...prev, imageUrl: null }));
      }
    } catch (err) {
      console.warn('[AppBackground] Failed to load background:', err);
    }
  }, [profile?.id, signAndApply]);

  useEffect(() => {
    refreshBackground();
  }, [refreshBackground]);

  // Re-sign every 45 minutes to prevent expiry
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      if (rawUrlRef.current && needsSigning(rawUrlRef.current)) {
        signAndApply(rawUrlRef.current);
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
    signAndApply(url);
  }, [signAndApply]);

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
      {children}
    </BackgroundContext.Provider>
  );
}
