import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/**
 * Detects if device is an iPad (modern iPads report as Macintosh)
 */
function detectIsIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /ipad/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
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
  const [isMobileOrTablet, setIsMobileOrTablet] = React.useState<boolean>(false);
  const [isIPad, setIsIPad] = React.useState<boolean>(false);

  React.useEffect(() => {
    const checkDevice = () => {
      const isIPadDevice = detectIsIPad();
      setIsIPad(isIPadDevice);
      // iPad always uses mobile/tablet layout regardless of screen size
      setIsMobileOrTablet(window.innerWidth < TABLET_BREAKPOINT || isIPadDevice);
    };

    checkDevice();

    const handleResize = () => checkDevice();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { isMobileOrTablet, isIPad };
}
