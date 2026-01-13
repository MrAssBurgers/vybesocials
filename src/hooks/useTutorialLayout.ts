import { useState, useEffect, useCallback } from 'react';
import { useBreakpoint } from '@/hooks/usePlatform';

export type TutorialLayoutMode = 'mobile' | 'tablet' | 'desktop';

/**
 * Detects the actual layout mode for tutorial purposes
 * - Desktop: sidebar visible (lg+ screen without touch)
 * - Tablet: iPad or md screens with touch OR sidebar folded out on large iPad
 * - Mobile: phone-sized screens
 * 
 * iPad with sidebar open = desktop tutorial flow
 * iPad without sidebar = tablet tutorial flow
 */
export function useTutorialLayout() {
  const { breakpoint, isMobile, isTablet, isDesktop, isIPad } = useBreakpoint();
  const [layoutMode, setLayoutMode] = useState<TutorialLayoutMode>('mobile');
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Check if sidebar is actually visible in the DOM
  const checkSidebarVisibility = useCallback(() => {
    // Look for the desktop sidebar element
    const sidebar = document.querySelector('[data-tutorial-sidebar]');
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      // Sidebar is visible if it's on screen and has width
      return rect.width > 50 && rect.left >= 0;
    }
    return false;
  }, []);

  // Check if bottom nav is visible
  const checkBottomNavVisibility = useCallback(() => {
    const bottomNav = document.querySelector('[data-tutorial-bottomnav]');
    if (bottomNav) {
      const rect = bottomNav.getBoundingClientRect();
      return rect.height > 0 && rect.top < window.innerHeight;
    }
    return false;
  }, []);

  useEffect(() => {
    const updateLayoutMode = () => {
      const hasSidebar = checkSidebarVisibility();
      const hasBottomNav = checkBottomNavVisibility();
      
      setSidebarVisible(hasSidebar);

      // Determine layout based on what's actually visible
      if (hasSidebar && !hasBottomNav) {
        // Desktop mode: sidebar visible, no bottom nav
        setLayoutMode('desktop');
      } else if (isIPad && hasSidebar) {
        // iPad with sidebar open = treat as desktop
        setLayoutMode('desktop');
      } else if (isTablet || isIPad) {
        // Tablet/iPad without sidebar = tablet mode
        setLayoutMode('tablet');
      } else if (isMobile) {
        // Phone = mobile mode
        setLayoutMode('mobile');
      } else if (isDesktop) {
        // Desktop breakpoint but check actual visibility
        setLayoutMode(hasSidebar ? 'desktop' : 'mobile');
      } else {
        // Fallback based on breakpoint
        setLayoutMode(isDesktop ? 'desktop' : isMobile ? 'mobile' : 'tablet');
      }
    };

    // Initial check
    updateLayoutMode();

    // Re-check on resize
    window.addEventListener('resize', updateLayoutMode);
    
    // Also observe DOM changes (sidebar may appear/disappear)
    const observer = new MutationObserver(updateLayoutMode);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', updateLayoutMode);
      observer.disconnect();
    };
  }, [isMobile, isTablet, isDesktop, isIPad, checkSidebarVisibility, checkBottomNavVisibility]);

  return {
    layoutMode,
    sidebarVisible,
    isIPad,
    breakpoint,
  };
}
