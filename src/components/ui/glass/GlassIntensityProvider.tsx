import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type GlassIntensity = 'calm' | 'normal' | 'max';

interface GlassIntensityContextType {
  intensity: GlassIntensity;
  setIntensity: (intensity: GlassIntensity) => void;
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

export function GlassIntensityProvider({ children }: { children: ReactNode }) {
  const [intensity, setIntensityState] = useState<GlassIntensity>(() => {
    if (typeof window === 'undefined') return 'normal';
    return (localStorage.getItem('vybe-glass-intensity') as GlassIntensity) || 'normal';
  });
  
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    localStorage.setItem('vybe-glass-intensity', intensity);
    document.documentElement.setAttribute('data-glass-intensity', intensity);
  }, [intensity]);

  // Track scrolling to pause animations
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      setIsScrolling(true);
      document.documentElement.classList.add('is-scrolling');
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
        document.documentElement.classList.remove('is-scrolling');
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const setIntensity = (newIntensity: GlassIntensity) => {
    setIntensityState(newIntensity);
  };

  const config = INTENSITY_CONFIG[intensity];
  
  const getBlur = () => config.blur;
  const getSaturation = () => config.saturation;
  const getBrightness = () => config.brightness;

  return (
    <GlassIntensityContext.Provider value={{ 
      intensity, 
      setIntensity, 
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
      getBlur: () => '40px',
      getSaturation: () => '200%',
      getBrightness: () => '1.05',
      isScrolling: false,
    };
  }
  return context;
}
