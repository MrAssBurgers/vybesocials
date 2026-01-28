import { memo, useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { navVisibility } from "@/lib/navVisibility";
import { isLegitimateHiddenRoute } from "@/hooks/useBottomNavSafety";
import { toast } from "sonner";

/**
 * CRITICAL: Root-level Bottom Navigation Mount
 * 
 * This component ensures the bottom navigation bar is ALWAYS visible on mobile/tablet.
 * It renders at the app root level, outside of all page layouts.
 * 
 * Safety Rules:
 * 1. On mobile/tablet: ALWAYS render (unless on legitimately hidden routes)
 * 2. Ignores user UI settings that try to hide nav on mobile/tablet
 * 3. Auto-repairs stuck CSS classes from wizard/overlay unmounts
 * 4. Shows repair toast if settings needed fixing
 */

// Routes where bottom nav should be hidden (immersive experiences)
const HIDDEN_NAV_ROUTES = ['/onboarding', '/complete-profile', '/upload', '/camera'];

// Routes with fullscreen experiences that manage their own nav
const IMMERSIVE_ROUTES = ['/shorts', '/clips'];

// CSS variable name for dynamic bottom padding
const BOTTOM_NAV_SPACE_VAR = '--bottom-nav-space';

export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);
  const hasShownRepairToast = useRef(false);

  // Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // FAILSAFE: On mount, check if bottom nav should be showing but isn't
  useEffect(() => {
    if (!mounted || !isMobileOrTablet) return;

    const checkNavVisibility = () => {
      const pathname = location.pathname;
      const isLegitimateHide = isLegitimateHiddenRoute(pathname);
      
      if (!isLegitimateHide) {
        const hasHideClass = document.body.classList.contains('hide-bottom-nav');
        const hasActiveOverlay = document.querySelector('.fixed.inset-0.z-\\[100\\]');
        
        if (hasHideClass && !hasActiveOverlay) {
          document.body.classList.remove('hide-bottom-nav');
          
          if (!hasShownRepairToast.current) {
            hasShownRepairToast.current = true;
            console.warn('[BottomNavMount] Auto-repaired stuck hide-bottom-nav class');
            toast.info("We restored your navigation to keep VYBE usable on mobile.", {
              duration: 4000,
            });
          }
        }
      }
    };

    // Check immediately
    checkNavVisibility();

    // Also check after a short delay (catches async unmount issues)
    const timeout = setTimeout(checkNavVisibility, 200);
    
    return () => clearTimeout(timeout);
  }, [mounted, isMobileOrTablet, location.pathname]);

  // Safety: if we navigate away from community chat while the input is focused,
  // the global navVisibility state can remain stuck hidden.
  useEffect(() => {
    const isCommunityRoute = location.pathname.startsWith('/community');
    if (!isCommunityRoute) {
      navVisibility.forceShow();
    }
  }, [location.pathname]);

  // AGGRESSIVE CLEANUP: Clear stuck classes when navigating to normal routes
  useEffect(() => {
    const path = location.pathname;
    const isLegitimateHide = isLegitimateHiddenRoute(path);

    // When navigating to a normal route, clean up immediately
    if (!isLegitimateHide && isMobileOrTablet) {
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        const hasActiveOverlay = document.querySelector('.fixed.inset-0.z-\\[100\\]');
        if (!hasActiveOverlay) {
          document.body.classList.remove('hide-bottom-nav');
          document.body.classList.remove('splash-visible');
        }
      });
    }
  }, [location.pathname, isMobileOrTablet]);
   
  // Hide nav when inside a specific DM conversation
  const isInDMConversation = /^\/messages\/[^/]+/.test(location.pathname);
  
  // Hide nav on onboarding/profile completion and capture flows
  const isHiddenRoute = HIDDEN_NAV_ROUTES.includes(location.pathname);
  
  // Check if we're on an immersive route
  const isImmersiveRoute = IMMERSIVE_ROUTES.some(route => location.pathname.startsWith(route));

  // Debug: log detection on mobile/tablet only
  useEffect(() => {
    if (isMobileOrTablet) {
      console.log('[BottomNavMount] Mobile/Tablet detected:', {
        pathname: location.pathname,
        shouldRender: !isInDMConversation && !isHiddenRoute && !isImmersiveRoute,
        windowWidth: window.innerWidth,
        hasHideClass: document.body.classList.contains('hide-bottom-nav'),
      });
    }
  }, [isMobileOrTablet, location.pathname, isInDMConversation, isHiddenRoute, isImmersiveRoute]);

  // CORE LOGIC: Determine if nav should render
  // On mobile/tablet: ALWAYS render unless on legitimate hidden routes
  const shouldRender = mounted && isMobileOrTablet && !isInDMConversation && !isHiddenRoute && !isImmersiveRoute;

  // Update CSS variable for dynamic bottom padding
  useEffect(() => {
    const root = document.documentElement;
    if (shouldRender) {
      root.style.setProperty(BOTTOM_NAV_SPACE_VAR, 'calc(5rem + env(safe-area-inset-bottom, 0px))');
    } else {
      root.style.setProperty(BOTTOM_NAV_SPACE_VAR, '0px');
    }

    return () => {
      root.style.setProperty(BOTTOM_NAV_SPACE_VAR, '0px');
    };
  }, [shouldRender]);

  // Don't render until mounted
  if (!mounted) return null;
  
  // Hide on desktop or hidden routes
  if (!shouldRender) return null;
  
  return <BottomNav />;
});
