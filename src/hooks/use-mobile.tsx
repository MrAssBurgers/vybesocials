import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
// Many Android tablets (and some iPad Pros) exceed 1024px CSS width.
// Use coarse-pointer + touch to keep them in the mobile/tablet UX (bottom nav).
const LARGE_TABLET_BREAKPOINT = 1440; // Increased to capture more tablets

/**
 * Detects if device is an iPad (modern iPads report as Macintosh)
 */
function detectIsIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /ipad/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Detects tablet-like devices that may exceed 1024px (common on Android tablets).
 */
function detectIsLargeTablet(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasTouch = navigator.maxTouchPoints > 0;
  const isCoarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  return hasTouch && isCoarse && window.innerWidth <= LARGE_TABLET_BREAKPOINT;
}

/**
 * Returns true for mobile phones only (< 768px)
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * Returns true for mobile AND tablet devices (< 1024px OR iPad)
 * Use this when you need bottom nav behavior (vs sidebar)
 */
export function useIsMobileOrTablet() {
  const [isMobileOrTablet, setIsMobileOrTablet] = React.useState<boolean>(() => {
    // Initialize with correct value on first render
    if (typeof window === 'undefined') return true; // Default to mobile for SSR safety
    const isIPadDevice = detectIsIPad();
    const isLargeTablet = detectIsLargeTablet();
    // Treat 1024px wide tablets as tablet (common in preview + some devices)
    // Use <= to include 1024px exactly (common tablet/preview width)
    return window.innerWidth <= TABLET_BREAKPOINT || isIPadDevice || isLargeTablet;
  });
  const [isIPad, setIsIPad] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return detectIsIPad();
  });

  React.useEffect(() => {
    const checkDevice = () => {
      const isIPadDevice = detectIsIPad();
      setIsIPad(isIPadDevice);
      const isLargeTablet = detectIsLargeTablet();
      // iPad always uses mobile/tablet layout regardless of screen size
      // Use <= to include 1024px exactly
      const shouldBeMobileOrTablet = window.innerWidth <= TABLET_BREAKPOINT || isIPadDevice || isLargeTablet;
      setIsMobileOrTablet(shouldBeMobileOrTablet);
    };

    // Run immediately to ensure we have correct initial value
    checkDevice();

    const handleResize = () => {
      // Debounce resize to prevent jank
      requestAnimationFrame(checkDevice);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { isMobileOrTablet, isIPad };
}
