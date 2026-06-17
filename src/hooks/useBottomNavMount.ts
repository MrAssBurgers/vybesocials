import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { isMobileOrTabletViewport } from '@/lib/mobileViewport';
import { isBottomNavTabRoute } from '@/lib/bottomNavRoutes';
import { navVisibility } from '@/lib/navVisibility';

/** Whether the floating bottom nav should mount on the current route/viewport. */
export function useBottomNavMount(): boolean {
  const location = useLocation();
  const { profile } = useAuth();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const [immersiveHidden, setImmersiveHidden] = useState(false);

  useEffect(() => {
    return navVisibility.subscribe((visible) => {
      setImmersiveHidden(!visible);
    });
  }, []);

  const isMobileShell = isMobileOrTablet || isMobileOrTabletViewport();
  const isTabRoute = isBottomNavTabRoute(location.pathname, profile);

  return isMobileShell && isTabRoute && !immersiveHidden;
}
