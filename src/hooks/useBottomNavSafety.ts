/**
 * Bottom Navigation Safety System
 * 
 * CRITICAL: This hook ensures the bottom navigation bar is ALWAYS visible on mobile/tablet devices.
 * It overrides ANY user settings that would hide the navigation on small screens.
 * 
 * Rules:
 * 1. Mobile/Tablet: Bottom nav ALWAYS renders - no exceptions
 * 2. Desktop: Bottom nav can be hidden via settings
 * 3. User settings can customize nav STYLE but not EXISTENCE on mobile/tablet
 * 4. Invalid saved layouts are auto-repaired on load
 */

import { useCallback, useEffect, useRef } from 'react';
import { useIsMobileOrTablet } from './use-mobile';
import { toast } from 'sonner';

// Routes where bottom nav is legitimately hidden even on mobile/tablet
const LEGITIMATE_HIDDEN_ROUTES = [
  '/onboarding',
  '/complete-profile',
  '/upload',
  '/camera',
  '/shorts',
  '/clips',
];

// Check if current route allows hiding bottom nav
export function isLegitimateHiddenRoute(pathname: string): boolean {
  // Exact matches
  if (LEGITIMATE_HIDDEN_ROUTES.includes(pathname)) return true;
  
  // Prefix matches for dynamic routes
  if (pathname.startsWith('/shorts/')) return true;
  if (pathname.startsWith('/clips/')) return true;
  if (pathname.startsWith('/messages/')) return true; // Inside DM conversation
  
  return false;
}

/**
 * Hook that enforces bottom nav visibility on mobile/tablet
 * Returns whether the nav should be force-shown
 */
export function useBottomNavSafety() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const hasShownRepairToast = useRef(false);

  // Failsafe: On mobile/tablet, aggressively remove any classes that hide bottom nav
  useEffect(() => {
    if (!isMobileOrTablet) return;

    // Check and clean up on mount
    const cleanupHiddenState = () => {
      const bodyClasses = document.body.classList;
      const hasHideClass = bodyClasses.contains('hide-bottom-nav');
      
      // Check if we're on a legitimate hidden route
      const pathname = window.location.pathname;
      const isLegitimateHide = isLegitimateHiddenRoute(pathname);
      
      // Also check for active overlays (wizard, camera, etc.)
      const hasActiveOverlay = 
        document.querySelector('.fixed.inset-0.z-\\[100\\]') || 
        document.querySelector('[data-bottom-nav-override="hide"]');
      
      if (hasHideClass && !isLegitimateHide && !hasActiveOverlay) {
        bodyClasses.remove('hide-bottom-nav');
        
        // Show repair toast once per session
        if (!hasShownRepairToast.current) {
          hasShownRepairToast.current = true;
          console.warn('[BottomNavSafety] Auto-repaired hidden nav state on mobile/tablet');
          toast.info("We restored your navigation to keep VYBE usable on mobile.", {
            duration: 4000,
          });
        }
      }
    };

    // Run immediately
    cleanupHiddenState();

    // Also run on any DOM changes (catches wizard unmount issues)
    const observer = new MutationObserver(() => {
      // Debounce slightly
      setTimeout(cleanupHiddenState, 100);
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [isMobileOrTablet]);

  // Force show callback - can be called to immediately show nav
  const forceShowNav = useCallback(() => {
    if (isMobileOrTablet) {
      document.body.classList.remove('hide-bottom-nav');
      document.body.classList.remove('splash-visible');
    }
  }, [isMobileOrTablet]);

  return {
    isMobileOrTablet,
    forceShowNav,
    shouldAlwaysShowNav: isMobileOrTablet,
  };
}

/**
 * Validates UI settings and auto-repairs invalid nav configurations
 * Returns repaired settings and a flag indicating if repair was needed
 */
export function repairNavSettings<T extends { navHidden?: boolean }>(
  settings: T,
  isMobileOrTablet: boolean
): { settings: T; wasRepaired: boolean } {
  let wasRepaired = false;

  // On mobile/tablet, force nav to be visible
  if (isMobileOrTablet && settings.navHidden === true) {
    settings = { ...settings, navHidden: false };
    wasRepaired = true;
  }

  return { settings, wasRepaired };
}

/**
 * Hook for the UI builder wizard to check if nav can be hidden
 */
export function useCanHideNav(): boolean {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  // Only desktop can hide nav
  return !isMobileOrTablet;
}
