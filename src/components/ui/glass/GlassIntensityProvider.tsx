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
}

const GlassIntensityContext = createContext<GlassIntensityContextType | undefined>(undefined);

const INTENSITY_CONFIG = {
  calm: { blur: '16px', saturation: '150%', brightness: '1.02' },
  normal: { blur: '40px', saturation: '200%', brightness: '1.05' },
  max: { blur: '60px', saturation: '250%', brightness: '1.08' },
};

// Detect if device is mobile for default high contrast
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 'ontouchstart' in window;
};

export function GlassIntensityProvider({ children }: { children: ReactNode }) {
  const [intensity, setIntensityState] = useState<GlassIntensity>(() => {
    if (typeof window === 'undefined') return 'normal';
    return (localStorage.getItem('vybe-glass-intensity') as GlassIntensity) || 'normal';
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

  // Track scrolling to pause animations - optimized with RAF
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;
    let rafId: number;
    let isCurrentlyScrolling = false;
    
    const handleScroll = () => {
      if (!isCurrentlyScrolling) {
        isCurrentlyScrolling = true;
        rafId = requestAnimationFrame(() => {
          setIsScrolling(true);
          document.documentElement.classList.add('is-scrolling');
        });
      }
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isCurrentlyScrolling = false;
        setIsScrolling(false);
        document.documentElement.classList.remove('is-scrolling');
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const setIntensity = useCallback((newIntensity: GlassIntensity) => {
    setIntensityState(newIntensity);
  }, []);

  const setContrast = useCallback((newContrast: ContrastMode) => {
    setContrastState(newContrast);
  }, []);

  const config = INTENSITY_CONFIG[intensity];
  
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
      isScrolling
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
    };
  }
  return context;
}
