import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export type GlassIntensity = 'calm' | 'normal' | 'max';
export type ContrastMode = 'normal' | 'high';

interface GlassIntensityContextType {
  intensity: GlassIntensity;
  setIntensity: (intensity: GlassIntensity) => void;
  contrast: ContrastMode;
  setContrast: (contrast: ContrastMode) => void;
  getBlur: () => string;
  getSaturation: () => string;
  getBrightness: () => string;
  isScrolling: boolean;
  isIOS: boolean;
}

const GlassIntensityContext = createContext<GlassIntensityContextType | undefined>(undefined);

const INTENSITY_CONFIG = {
  calm: { blur: '8px', saturation: '130%', brightness: '1.01' },
  normal: { blur: '16px', saturation: '160%', brightness: '1.02' },
  max: { blur: '20px', saturation: '170%', brightness: '1.03' },
};

// iOS-reduced intensity config
const IOS_INTENSITY_CONFIG = {
  calm: { blur: '4px', saturation: '110%', brightness: '1.0' },
  normal: { blur: '6px', saturation: '120%', brightness: '1.01' },
  max: { blur: '10px', saturation: '130%', brightness: '1.02' },
};

// Detect if device is mobile for default high contrast
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 'ontouchstart' in window;
};

// Detect iOS Safari
const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  return /iphone|ipad|ipod/.test(ua) || (/mac/.test(platform) && navigator.maxTouchPoints > 1);
};

export function GlassIntensityProvider({ children }: { children: ReactNode }) {
  const [isIOS] = useState(() => isIOSDevice());
  
  const [intensity, setIntensityState] = useState<GlassIntensity>(() => {
    if (typeof window === 'undefined') return 'normal';
    const stored = localStorage.getItem('vybe-glass-intensity') as GlassIntensity;
    // Default to 'calm' on iOS for better performance
    return stored || (isIOSDevice() ? 'calm' : 'normal');
  });
  
  const [contrast, setContrastState] = useState<ContrastMode>(() => {
    if (typeof window === 'undefined') return 'normal';
    const stored = localStorage.getItem('vybe-contrast-mode') as ContrastMode;
    // Default to high contrast on mobile for better readability
    return stored || (isMobileDevice() ? 'high' : 'normal');
  });
  
  const [isScrolling, setIsScrolling] = useState(false);

  // Apply intensity and contrast to document
  useEffect(() => {
    localStorage.setItem('vybe-glass-intensity', intensity);
    document.documentElement.setAttribute('data-glass-intensity', intensity);
  }, [intensity]);

  useEffect(() => {
    localStorage.setItem('vybe-contrast-mode', contrast);
    document.documentElement.setAttribute('data-contrast', contrast);
  }, [contrast]);

  // Scroll-state class management is handled centrally by useScrollOptimization
  // (mounted in AppLayout). We intentionally do NOT add a second listener here
  // — having two systems toggling `is-scrolling` caused timing conflicts and
  // visible flicker/darkening during scroll.
  // `isScrolling` is kept in state purely for any consumer that reads it.
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      const active = html.classList.contains('is-scrolling');
      setIsScrolling((prev) => (prev === active ? prev : active));
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const setIntensity = useCallback((newIntensity: GlassIntensity) => {
    setIntensityState(newIntensity);
  }, []);

  const setContrast = useCallback((newContrast: ContrastMode) => {
    setContrastState(newContrast);
  }, []);

  // Use reduced config on iOS
  const config = isIOS ? IOS_INTENSITY_CONFIG[intensity] : INTENSITY_CONFIG[intensity];
  
  const getBlur = useCallback(() => config.blur, [config.blur]);
  const getSaturation = useCallback(() => config.saturation, [config.saturation]);
  const getBrightness = useCallback(() => config.brightness, [config.brightness]);

  return (
    <GlassIntensityContext.Provider value={{ 
      intensity, 
      setIntensity, 
      contrast,
      setContrast,
      getBlur, 
      getSaturation, 
      getBrightness,
      isScrolling,
      isIOS,
    }}>
      {children}
    </GlassIntensityContext.Provider>
  );
}

export function useGlassIntensity() {
  const context = useContext(GlassIntensityContext);
  if (context === undefined) {
    // Return safe defaults if used outside provider
    return {
      intensity: 'normal' as GlassIntensity,
      setIntensity: () => {},
      contrast: 'normal' as ContrastMode,
      setContrast: () => {},
      getBlur: () => '40px',
      getSaturation: () => '200%',
      getBrightness: () => '1.05',
      isScrolling: false,
      isIOS: false,
    };
  }
  return context;
}
