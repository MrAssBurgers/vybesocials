import { memo, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

const DESKTOP_MIN_WIDTH = 1024;

function useViewportBelowDesktop() {
  const getIsBelow = () => (typeof window !== "undefined" ? window.innerWidth < DESKTOP_MIN_WIDTH : false);
  const [isBelow, setIsBelow] = useState(getIsBelow);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

    const onChange = () => {
      setIsBelow(window.innerWidth < DESKTOP_MIN_WIDTH);
    };

    onChange();
    mql.addEventListener("change", onChange);

    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, []);

  return isBelow;
}

/**
 * Forces BottomNav to mount at the app root on all viewports < 1024px.
 * Hides nav when inside a DM conversation.
 */
export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const show = useViewportBelowDesktop();
  const location = useLocation();
  
  // Hide nav when inside a specific DM conversation (e.g., /messages/uuid)
  const isInDMConversation = /^\/messages\/[^/]+/.test(location.pathname);
  
  if (!show || isInDMConversation) return null;
  return <BottomNav />;
});
