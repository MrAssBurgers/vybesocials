import { memo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useBottomNavMount } from "@/hooks/useBottomNavMount";
import { isBottomNavTabRoute } from "@/lib/bottomNavRoutes";
import { useAuth } from "@/lib/auth";
import { navVisibility } from "@/lib/navVisibility";

/**
 * Mounts BottomNav only on primary tab routes (Instagram-style).
 * Scroll, keyboard, and immersive overlays still hide it via navVisibility.
 */
export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const location = useLocation();
  const { profile } = useAuth();
  const showNav = useBottomNavMount();

  useEffect(() => {
    if (isBottomNavTabRoute(location.pathname, profile)) {
      navVisibility.forceShow();
      navVisibility.resetScrollHide();
    }
  }, [location.pathname, profile]);

  if (!showNav) return null;
  return <BottomNav />;
});
