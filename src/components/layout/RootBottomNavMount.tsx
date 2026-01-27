import { memo, useEffect } from "react";
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
const HIDDEN_NAV_ROUTES = ['/', '/onboarding', '/complete-profile', '/upload', '/camera'];

export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const location = useLocation();

  // Safety: if we navigate away from community chat while the input is focused,
  // the global navVisibility state can remain stuck hidden.
  useEffect(() => {
    const isCommunityRoute = location.pathname.startsWith('/community');
    if (!isCommunityRoute) {
      navVisibility.forceShow();
    }
  }, [location.pathname]);
  
  // Hide nav when inside a specific DM conversation (e.g., /messages/uuid)
  const isInDMConversation = /^\/messages\/[^/]+/.test(location.pathname);
  
  // Hide nav on landing, onboarding, and profile completion pages
  const isHiddenRoute = HIDDEN_NAV_ROUTES.includes(location.pathname);
  
  if (!isMobileOrTablet || isInDMConversation || isHiddenRoute) return null;
  return <BottomNav />;
});
