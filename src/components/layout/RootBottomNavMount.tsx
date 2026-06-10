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
const HIDDEN_NAV_ROUTES = ['/', '/onboarding', '/complete-profile', '/upload', '/camera', '/map', '/spaces', '/VYBE-AI'];

function isFullscreenMediaRoute(pathname: string): boolean {
  return (
    /^\/watch\/[^/]+/.test(pathname) ||
    /^\/clips\/[^/]+/.test(pathname)
  );
}

function isImmersiveRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/spaces/') ||
    pathname === '/community' ||
    pathname.startsWith('/messages/new')
  );
}

export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const location = useLocation();
  const [immersiveHidden, setImmersiveHidden] = useState(false);

  useEffect(() => {
    return navVisibility.subscribe((visible) => {
      setImmersiveHidden(!visible);
    });
  }, []);
  
  // Hide nav inside any messages sub-route (conversation, new message, etc.)
  const isInMessagesSubRoute = location.pathname.startsWith('/messages/');
  
  // Hide nav on landing, onboarding, and profile completion pages
  const isHiddenRoute = HIDDEN_NAV_ROUTES.includes(location.pathname);
  const hideForMedia = isFullscreenMediaRoute(location.pathname);
  const hideForImmersiveRoute = isImmersiveRoute(location.pathname) && immersiveHidden;
  
  if (!isMobileOrTablet || isInMessagesSubRoute || isHiddenRoute || hideForMedia || hideForImmersiveRoute) return null;
  return <BottomNav />;
});
