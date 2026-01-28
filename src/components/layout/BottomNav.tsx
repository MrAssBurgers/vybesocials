import { Home, Compass, PlusCircle, MessageCircle, Settings } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo, useEffect, forwardRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenu } from '@/components/hub/CreateMenu';
import { VYBEHub } from '@/components/hub/VYBEHub';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { useAuth } from '@/lib/auth';
import { navVisibility } from '@/lib/navVisibility';
import { useScrollDirection } from '@/hooks/useScrollDirection';

// Hook to listen to navVisibility centralized state (for community chat input hide)
function useNavVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribe(setIsVisible);
  }, []);

  return isVisible;
}

// Hook for scroll-based visibility
function useScrollVisibility() {
  const { scrollDirection, isAtTop } = useScrollDirection({ threshold: 15 });
  
  // Show nav when:
  // 1. At top of page
  // 2. Scrolling up
  // 3. No scroll has happened yet (initial state)
  const shouldShow = isAtTop || scrollDirection === 'up' || scrollDirection === null;
  
  return shouldShow;
}

type NavItemProps = {
  path: string;
  icon: typeof Home;
  badge: number;
  isActive: boolean;
  tutorialId?: string;
  isHighlighted?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

// Memoized nav item for better performance (and ref-safe for Radix/asChild usages)
const NavItem = memo(forwardRef<HTMLAnchorElement, NavItemProps>(function NavItem({ 
  path, 
  icon: Icon, 
  badge, 
  isActive,
  tutorialId,
  isHighlighted,
  onClick,
}, ref) {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    } else {
      triggerNavFeedback();
    }
  };

  return (
    <Link
      to={path}
      ref={ref}
      className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
      onClick={handleClick}
      data-tutorial={tutorialId}
    >
      <div className="relative p-2">
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl bg-primary/15"
          />
        )}
        
        {/* Tutorial highlight ring - simplified */}
        {isHighlighted && (
          <div
            className="absolute -inset-1 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
          />
        )}
        
        <Icon
          className={cn(
            "h-5 w-5 relative z-10",
            isActive ? "text-primary" : "text-muted-foreground",
            isHighlighted && "text-primary"
          )}
        />
        
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
    </Link>
  );
}));

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { isGuest } = useIsGuest();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  
  // NavVisibility (for community chat/input hide)
  const navCentralVisible = useNavVisibility();
  
  // Scroll-based visibility: show on scroll up, hide on scroll down
  const scrollVisible = useScrollVisibility();
  
  // Combined visibility: both must be true to show
  const isNavVisible = navCentralVisible && scrollVisible;

  // Hide bottom nav ONLY when onboarding is explicitly incomplete.
  // If profile is still loading / null, we should still render the nav.
  // Guest users always see the nav.
  const shouldHideForOnboarding = !authLoading && !isGuest && profile?.onboarding_completed === false;

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [highlightedNav, setHighlightedNav] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState('');
  
  const lastTapTime = useRef(0);

  // Tutorial event listeners for controlling menus and highlighting
  useEffect(() => {
    const handleOpenCreateMenu = () => setIsCreateMenuOpen(true);
    const handleOpenVYBEHub = () => {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    };
    const handleCloseMenus = () => {
      setIsCreateMenuOpen(false);
      setIsHubOpen(false);
    };
    const handleHighlightNav = (e: CustomEvent<{ navId: string | null }>) => {
      setHighlightedNav(e.detail.navId);
    };

    window.addEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
    window.addEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
    window.addEventListener('tutorial-close-menus', handleCloseMenus);
    window.addEventListener('tutorial-highlight-nav', handleHighlightNav as EventListener);

    return () => {
      window.removeEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
      window.removeEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
      window.removeEventListener('tutorial-close-menus', handleCloseMenus);
      window.removeEventListener('tutorial-highlight-nav', handleHighlightNav as EventListener);
    };
  }, []);

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Guest users need to sign up to create content
    if (isGuest) {
      setAuthPromptAction('create posts');
      setShowAuthPrompt(true);
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    triggerHaptic('medium');
    playSound('pop');
    
    // Fast double tap opens the hub
    if (timeSinceLastTap < 300) {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    } else if (isCreateMenuOpen) {
      // Single tap when menu is open closes it
      setIsCreateMenuOpen(false);
    } else {
      // Single tap when menu is closed opens it
      setIsCreateMenuOpen(true);
    }
    
    lastTapTime.current = now;
  }, [isCreateMenuOpen, isGuest]);

  // Handle protected nav clicks for guests
  const handleProtectedNavClick = useCallback((action: string) => (e: React.MouseEvent) => {
    if (isGuest) {
      e.preventDefault();
      setAuthPromptAction(action);
      setShowAuthPrompt(true);
    } else {
      triggerNavFeedback();
    }
  }, [isGuest]);

  // Nav order: Home | Explore | Upload | Messages | Settings
  const navItems = [
    { icon: Home, path: '/home', badge: 0, tutorialId: 'home-nav', requiresAuth: false },
    { icon: Compass, path: '/explore', badge: 0, tutorialId: 'explore-nav', requiresAuth: false },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0, tutorialId: 'create-nav', requiresAuth: true },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages, tutorialId: 'messages-nav', requiresAuth: true, authAction: 'send messages' },
    { icon: Settings, path: '/settings', badge: 0, tutorialId: 'settings-nav', requiresAuth: false },
  ];

  // Don't render bottom nav if onboarding explicitly not complete (unless guest browsing)
  if (shouldHideForOnboarding && !isGuest) {
    return null;
  }

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />
      <GuestAuthPrompt 
        variant="modal"
        action={authPromptAction}
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
      />

      <nav 
        className="fixed bottom-0 left-0 right-0 w-full pointer-events-auto"
        style={{
          // CRITICAL: Highest z-index to ensure nav is always on top
          zIndex: 2147483647,
          // Safe area support for iOS
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          // Show/hide based on scroll direction + central visibility
          transform: isNavVisible ? 'translateY(0)' : 'translateY(100%)',
          opacity: isNavVisible ? 1 : 0,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out',
          // Ensure nav is never clipped
          contain: 'layout',
          isolation: 'isolate',
        }}
        aria-label="Bottom navigation"
        data-tutorial-bottomnav
        data-bottom-nav="true"
      >
        {/* Compact glass bar */}
        <div className="mx-2 mb-2 rounded-2xl liquid-glass border border-foreground/15 shadow-lg shadow-black/30">
          <div className="grid grid-cols-5 h-14 px-1 relative z-10">
          {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              const isHighlighted = highlightedNav === item.tutorialId;

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center" data-tutorial="create-nav">
                    <button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation group"
                      onClick={handleCreateClick}
                    >
                      {/* Tutorial highlight ring for create button */}
                      {isHighlighted && (
                        <div
                          className="absolute inset-0 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
                        />
                      )}
                      {/* Animated gradient background */}
                      <div 
                        className="rounded-xl p-2.5 shadow-lg transition-transform duration-200 ease-out active:scale-90 group-hover:scale-105 create-button-gradient"
                      >
                        <PlusCircle className="h-5 w-5 text-white relative z-10" />
                      </div>
                    </button>
                  </div>
                );
              }

              return (
                <NavItem
                  key={item.path}
                  path={item.path}
                  icon={item.icon}
                  badge={item.badge}
                  isActive={isActive}
                  tutorialId={item.tutorialId}
                  isHighlighted={isHighlighted}
                  onClick={item.requiresAuth ? handleProtectedNavClick(item.authAction || 'use this feature') : undefined}
                />
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
