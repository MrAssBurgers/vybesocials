import { memo, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { navVisibility } from "@/lib/navVisibility";

/**
 * Forces BottomNav to mount at the app root on all mobile/tablet viewports.
 * Includes iPad in any orientation.
 * Hides nav when inside a DM conversation.
 */
// Routes where bottom nav should be hidden
// NOTE: Do NOT hide on `/` because `/` is the primary Home route in this app.
const HIDDEN_NAV_ROUTES = ['/onboarding', '/complete-profile', '/upload', '/camera'];

// Routes where we use hideNav in AppLayout (immersive experiences)
const IMMERSIVE_ROUTES = ['/shorts', '/clips'];

export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before rendering to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Safety: if we navigate away from community chat while the input is focused,
  // the global navVisibility state can remain stuck hidden.
  useEffect(() => {
    const isCommunityRoute = location.pathname.startsWith('/community');
    if (!isCommunityRoute) {
      navVisibility.forceShow();
    }
  }, [location.pathname]);

  // Safety: landing/intro/splash can hide the bottom nav via a BODY class.
  // If that class ever gets stuck (HMR, interrupted unmount), the nav will stay hidden.
  // Clear it on all normal app routes.
  useEffect(() => {
    const path = location.pathname;
    const shouldAllowBodyHide =
      path === '/' ||
      path === '/onboarding' ||
      path === '/complete-profile' ||
      path === '/upload' ||
      path === '/camera';

    if (!shouldAllowBodyHide) {
      document.body.classList.remove('hide-bottom-nav');
      document.body.classList.remove('splash-visible');
    }
  }, [location.pathname]);
  
  // Hide nav when inside a specific DM conversation (e.g., /messages/uuid)
  const isInDMConversation = /^\/messages\/[^/]+/.test(location.pathname);
  
  // Hide nav on onboarding/profile completion and capture flows
  const isHiddenRoute = HIDDEN_NAV_ROUTES.includes(location.pathname);
  
  // Check if we're on an immersive route (clips/shorts with their own fullscreen experience)
  const isImmersiveRoute = IMMERSIVE_ROUTES.some(route => location.pathname.startsWith(route));
  
  // Don't render until mounted (prevents hydration mismatch)
  if (!mounted) return null;
  
  // Hide on desktop or hidden routes
  if (!isMobileOrTablet || isInDMConversation || isHiddenRoute || isImmersiveRoute) return null;
  
  return <BottomNav />;
});
