import { memo } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";

/**
 * Forces BottomNav to mount at the app root on all mobile/tablet viewports.
 * Includes iPad in any orientation.
 * Hides nav when inside a DM conversation.
 */
// Routes where bottom nav should be hidden
const HIDDEN_NAV_ROUTES = ['/', '/onboarding', '/complete-profile', '/upload', '/camera', '/map', '/spaces', '/VYBE-AI'];

export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const location = useLocation();
  
  // Hide nav when inside a specific DM conversation (e.g., /messages/uuid)
  const isInDMConversation = /^\/messages\/[^/]+/.test(location.pathname);
  
  // Hide nav on landing, onboarding, and profile completion pages
  const isHiddenRoute = HIDDEN_NAV_ROUTES.includes(location.pathname);
  
  if (!isMobileOrTablet || isInDMConversation || isHiddenRoute) return null;
  return <BottomNav />;
});
