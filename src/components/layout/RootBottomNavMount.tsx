import { memo, useEffect, useState } from "react";
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
 * No route/layout/scroll conditions.
 */
export const RootBottomNavMount = memo(function RootBottomNavMount() {
  const show = useViewportBelowDesktop();
  if (!show) return null;
  return <BottomNav />;
});
