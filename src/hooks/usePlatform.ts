import { useState, useEffect, useMemo } from 'react';

export type PlatformType = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type PerformanceTier = 'low' | 'medium' | 'high';

interface PlatformInfo {
  platform: PlatformType;
  device: DeviceType;
  performanceTier: PerformanceTier;
  supportsHover: boolean;
  supportsTouch: boolean;
  isStandalone: boolean; // PWA mode
  hasNotch: boolean;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  connectionType: 'slow' | 'fast' | 'offline' | 'unknown';
  isLowPowerMode: boolean;
}

function detectPlatform(): PlatformType {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  
  if (/iphone|ipad|ipod/.test(ua) || /mac/.test(platform) && navigator.maxTouchPoints > 1) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  if (/win/.test(platform)) {
    return 'windows';
  }
  if (/mac/.test(platform)) {
    return 'macos';
  }
  if (/linux/.test(platform)) {
    return 'linux';
  }
  return 'unknown';
}

function detectDevice(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // iPad detection (iPads report as Macintosh now)
  const isIPad = /macintosh/.test(navigator.userAgent.toLowerCase()) && navigator.maxTouchPoints > 1;
  
  if (width < 768 || (hasTouch && width < 768)) {
    return 'mobile';
  }
  if ((width >= 768 && width < 1024) || isIPad) {
    return 'tablet';
  }
  return 'desktop';
}

function detectPerformanceTier(): PerformanceTier {
  if (typeof navigator === 'undefined') return 'medium';
  
  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  
  // Check device memory (if available)
  const memory = (navigator as any).deviceMemory || 4;
  
  // Check for low-end indicators
  const ua = navigator.userAgent.toLowerCase();
  const isOldDevice = /android [1-6]\./.test(ua) || /iphone os [1-9]_/.test(ua);
  
  // Check connection for network-bound performance
  const connection = (navigator as any).connection;
  const isSlowConnection = connection && 
    (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g');
  
  if (isOldDevice || cores <= 2 || memory <= 2 || isSlowConnection) {
    return 'low';
  }
  if (cores >= 8 && memory >= 8) {
    return 'high';
  }
  return 'medium';
}

function getSafeAreaInsets() {
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  
  const style = getComputedStyle(document.documentElement);
  
  return {
    top: parseInt(style.getPropertyValue('--sat') || '0', 10) || 
         parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
    right: parseInt(style.getPropertyValue('--sar') || '0', 10) ||
           parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--sab') || '0', 10) ||
            parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
    left: parseInt(style.getPropertyValue('--sal') || '0', 10) ||
          parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
  };
}

function detectNotch(): boolean {
  if (typeof window === 'undefined') return false;
  
  // iOS notch detection
  const hasTopInset = CSS.supports('padding-top: env(safe-area-inset-top)') &&
    window.innerHeight !== window.screen.height;
  
  // Android notch (display cutout)
  const hasDisplayCutout = window.matchMedia?.('(display-mode: standalone)')?.matches ||
    document.documentElement.style.getPropertyValue('--notch-height') !== '';
  
  return hasTopInset || hasDisplayCutout;
}

function getConnectionType(): 'slow' | 'fast' | 'offline' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  
  if (!navigator.onLine) return 'offline';
  
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  if (!connection) return 'unknown';
  
  const { effectiveType, downlink } = connection;
  
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 1) {
    return 'slow';
  }
  
  return 'fast';
}

export function usePlatform(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>(() => ({
    platform: detectPlatform(),
    device: detectDevice(),
    performanceTier: detectPerformanceTier(),
    supportsHover: false,
    supportsTouch: false,
    isStandalone: false,
    hasNotch: false,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    prefersReducedMotion: false,
    prefersHighContrast: false,
    connectionType: 'unknown',
    isLowPowerMode: false,
  }));

  useEffect(() => {
    // Full detection on mount
    const supportsHover = window.matchMedia('(hover: hover)').matches;
    const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    
    setInfo({
      platform: detectPlatform(),
      device: detectDevice(),
      performanceTier: detectPerformanceTier(),
      supportsHover,
      supportsTouch,
      isStandalone,
      hasNotch: detectNotch(),
      safeAreaInsets: getSafeAreaInsets(),
      prefersReducedMotion,
      prefersHighContrast,
      connectionType: getConnectionType(),
      isLowPowerMode: false,
    });

    // Listen for changes
    const handleResize = () => {
      setInfo(prev => ({
        ...prev,
        device: detectDevice(),
        safeAreaInsets: getSafeAreaInsets(),
      }));
    };

    const handleOnline = () => {
      setInfo(prev => ({ ...prev, connectionType: getConnectionType() }));
    };

    const handleOffline = () => {
      setInfo(prev => ({ ...prev, connectionType: 'offline' }));
    };

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleReducedMotion = (e: MediaQueryListEvent) => {
      setInfo(prev => ({ ...prev, prefersReducedMotion: e.matches }));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    reducedMotionQuery.addEventListener('change', handleReducedMotion);

    // Connection change listener
    const connection = (navigator as any).connection;
    const handleConnectionChange = () => {
      setInfo(prev => ({ 
        ...prev, 
        connectionType: getConnectionType(),
        performanceTier: detectPerformanceTier(),
      }));
    };
    connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      reducedMotionQuery.removeEventListener('change', handleReducedMotion);
      connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, []);

  return info;
}

// Utility hook for responsive breakpoints
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'>('md');
  const [isIPad, setIsIPad] = useState(false);

  useEffect(() => {
    const getBreakpoint = () => {
      const width = window.innerWidth;
      if (width < 640) return 'xs';
      if (width < 768) return 'sm';
      if (width < 1024) return 'md';
      if (width < 1280) return 'lg';
      if (width < 1536) return 'xl';
      return '2xl';
    };

    // Detect iPad (iPads report as Macintosh with touch)
    const detectIPad = () => {
      const ua = navigator.userAgent.toLowerCase();
      return (
        /ipad/.test(ua) ||
        (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      );
    };

    setBreakpoint(getBreakpoint());
    setIsIPad(detectIPad());

    const handleResize = () => setBreakpoint(getBreakpoint());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Desktop = sidebars (xl+ and no touch), Tablet/iPad/Mobile = bottom nav
  const isMobileBreakpoint = breakpoint === 'xs' || breakpoint === 'sm';
  const isDesktopBreakpoint = breakpoint === 'xl' || breakpoint === '2xl';
  const isTabletBreakpoint = breakpoint === 'md' || breakpoint === 'lg';

  return {
    breakpoint,
    isMobile: isMobileBreakpoint && !isIPad,
    // iPad should ALWAYS be treated as tablet regardless of width
    isTablet: isIPad || (isTabletBreakpoint && !isDesktopBreakpoint),
    // ONLY true desktop (xl+ 1280px) gets sidebars - NOT tablets or iPads
    isDesktop: isDesktopBreakpoint && !isIPad,
    isIPad,
  };
}

// Utility to get platform-specific styles
export function getPlatformStyles(platform: PlatformType) {
  switch (platform) {
    case 'ios':
      return {
        borderRadius: '1rem',
        fontWeight: '500' as const,
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    case 'android':
      return {
        borderRadius: '0.75rem',
        fontWeight: '500' as const,
        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    default:
      return {
        borderRadius: '0.5rem',
        fontWeight: '500' as const,
        transition: 'transform 0.15s ease',
      };
  }
}
