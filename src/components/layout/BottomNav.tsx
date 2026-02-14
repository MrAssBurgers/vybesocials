import { Home, Compass, Plus, MessageCircle, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo, useEffect, forwardRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenuLayer } from '@/components/hub/CreateMenuLayer';
import { VYBEHub } from '@/components/hub/VYBEHub';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { useAuth } from '@/lib/auth';
import { navVisibility } from '@/lib/navVisibility';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Singleton scroll direction detection to prevent duplicate listeners
let scrollDirectionCleanup: (() => void) | null = null;
let scrollVisibility = true;
const scrollVisibilityListeners = new Set<(visible: boolean) => void>();

function setupScrollDirectionListener() {
  if (scrollDirectionCleanup) return;
  
  let lastScrollY = 0;
  let ticking = false;

  const handleScroll = (e?: Event) => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      // Check both window scroll and the app scroll container
      const scrollContainer = document.querySelector('[data-app-scroll-container="true"]');
      const currentScrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
      const scrollDiff = currentScrollY - lastScrollY;
      
      if (Math.abs(scrollDiff) > 10) {
        scrollVisibility = !(scrollDiff > 0 && currentScrollY > 50);
      }
      
      if (currentScrollY < 50) {
        scrollVisibility = true;
      }
      
      lastScrollY = currentScrollY;
      ticking = false;
      
      scrollVisibilityListeners.forEach(fn => fn(scrollVisibility));
    });
  };

  // Listen on both window AND the app scroll container
  window.addEventListener('scroll', handleScroll, { passive: true });
  
  // Also attach to the main scroll container when it appears
  const observer = new MutationObserver(() => {
    const container = document.querySelector('[data-app-scroll-container="true"]');
    if (container && !(container as any).__scrollBound) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      (container as any).__scrollBound = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Initial check
  const container = document.querySelector('[data-app-scroll-container="true"]');
  if (container) {
    container.addEventListener('scroll', handleScroll, { passive: true });
    (container as any).__scrollBound = true;
  }

  scrollDirectionCleanup = () => {
    window.removeEventListener('scroll', handleScroll);
    observer.disconnect();
    const el = document.querySelector('[data-app-scroll-container="true"]');
    if (el) el.removeEventListener('scroll', handleScroll);
    scrollDirectionCleanup = null;
  };
}

// Hook to detect scroll direction - uses singleton listener
function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setupScrollDirectionListener();
    
    scrollVisibilityListeners.add(setIsVisible);
    setIsVisible(scrollVisibility);

    return () => {
      scrollVisibilityListeners.delete(setIsVisible);
      if (scrollVisibilityListeners.size === 0 && scrollDirectionCleanup) {
        scrollDirectionCleanup();
      }
    };
  }, []);

  return isVisible;
}

// Hook to listen to navVisibility centralized state
function useNavVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribe(setIsVisible);
  }, []);

  return isVisible;
}

// Memoized nav item for better performance
const NavItem = memo(({ 
  path, 
  icon: Icon, 
  label,
  badge, 
  isActive,
  tutorialId,
  isHighlighted,
  onClick,
}: { 
  path: string; 
  icon: typeof Home; 
  label: string;
  badge: number; 
  isActive: boolean;
  tutorialId?: string;
  isHighlighted?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) => {
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
      className="relative flex items-center justify-center min-h-[48px] group"
      onClick={handleClick}
      data-tutorial={tutorialId}
    >
      <motion.div 
        className="relative"
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.1 }}
      >
        {/* Active indicator dot */}
        {isActive && (
          <motion.div
            layoutId="nav-indicator"
            className="absolute -inset-1.5 rounded-xl bg-primary/15"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        
        {/* Tutorial highlight ring */}
        {isHighlighted && (
          <div className="absolute -inset-2 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse" />
        )}
        
        <Icon
          className={cn(
            "h-6 w-6 relative z-10 transition-colors duration-150",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        
        {badge > 0 && (
          <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20"
          >
            {badge > 9 ? '9+' : badge}
          </motion.span>
        )}
      </motion.div>
    </Link>
  );
});

export const BottomNav = memo(forwardRef<HTMLElement, object>(function BottomNav(_props, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const scrollVisible = useScrollDirection();
  const navCentralVisible = useNavVisibility();
  
  // Combine both visibility states
  const isVisible = scrollVisible && navCentralVisible;

  // Hide bottom nav until user has completed onboarding
  const onboardingComplete = profile?.onboarding_completed === true;

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

  // Nav order: Home | Explore | Upload | Messages | Profile (cleaner than Settings)
  const navItems = [
    { icon: Home, label: 'Home', path: '/home', badge: 0, tutorialId: 'home-nav', requiresAuth: false },
    { icon: Compass, label: 'Explore', path: '/explore', badge: 0, tutorialId: 'explore-nav', requiresAuth: false },
    { icon: Plus, label: 'Create', path: '/upload', isCreate: true, badge: 0, tutorialId: 'create-nav', requiresAuth: true },
    { icon: MessageCircle, label: 'Messages', path: '/messages', badge: unreadMessages, tutorialId: 'messages-nav', requiresAuth: true, authAction: 'send messages' },
    { icon: User, label: 'Profile', path: profile ? `/u/${profile.username}` : '/settings', badge: 0, tutorialId: 'profile-nav', requiresAuth: false, isProfile: true },
  ];

  // Don't render bottom nav if onboarding not complete (unless guest browsing)
  if (!onboardingComplete && !isGuest) {
    return null;
  }

  return (
    <>
      <CreateMenuLayer open={isCreateMenuOpen} onOpenChange={setIsCreateMenuOpen} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />
      <GuestAuthPrompt 
        variant="modal"
        action={authPromptAction}
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
      />

       <motion.nav 
         ref={ref}
         className="fixed bottom-0 left-0 right-0 w-full pointer-events-auto"
        initial={false}
        animate={{
          y: isVisible ? 0 : 120,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 24,
          mass: 0.9,
        }}
        style={{
          zIndex: 5002,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
        aria-label="Bottom navigation"
        data-tutorial-bottomnav
      >
        {/* Vybe-themed bubble nav */}
        <div 
          className="mx-3 mb-2 rounded-[20px] overflow-hidden border border-white/10 liquid-glass-depth"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.35), hsl(var(--accent) / 0.28), hsl(var(--primary) / 0.2))',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 8px 32px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(var(--primary) / 0.15)',
          }}
        >
          <div className="grid grid-cols-5 h-14 px-1 relative z-10">
          {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              const isHighlighted = highlightedNav === item.tutorialId;

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center" data-tutorial="create-nav">
                    <motion.button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation"
                      onClick={handleCreateClick}
                      whileTap={{ scale: 0.8 }}
                      whileHover={{ scale: 1.08 }}
                    >
                      {/* Outer pulsing glow ring */}
                      <motion.div
                        className="absolute rounded-2xl"
                        style={{
                          inset: -3,
                          background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                          backgroundSize: '300% 300%',
                          animation: 'gradient-shift 4s ease infinite',
                          opacity: 0.5,
                          filter: 'blur(8px)',
                        }}
                      />
                      
                      {/* Animated glow ring when menu is open */}
                      <AnimatePresence>
                        {isCreateMenuOpen && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.5, opacity: 0.7 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 rounded-2xl"
                            style={{
                              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.6), hsl(var(--accent) / 0.6))',
                              filter: 'blur(12px)',
                            }}
                          />
                        )}
                      </AnimatePresence>
                      
                      {/* Tutorial highlight ring */}
                      {isHighlighted && (
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="absolute -inset-1 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
                        />
                      )}
                      
                      {/* Main button with gradient */}
                      <motion.div 
                        animate={{ 
                          rotate: isCreateMenuOpen ? 45 : 0,
                          scale: isCreateMenuOpen ? 1.15 : 1,
                        }}
                        transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                        className="rounded-2xl p-2.5 create-button-gradient relative overflow-hidden"
                      >
                        {/* Continuous shimmer sweep */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
                          style={{ width: '50%' }}
                        />
                        <Plus className="h-6 w-6 text-white relative z-10" strokeWidth={2.5} />
                      </motion.div>
                    </motion.button>
                  </div>
                );
              }

              // For profile nav item, render avatar instead of icon
              if (item.isProfile) {
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="relative flex items-center justify-center min-h-[48px] group"
                    onClick={() => triggerNavFeedback()}
                    data-tutorial={item.tutorialId}
                  >
                    <motion.div 
                      className="relative"
                      whileTap={{ scale: 0.9 }}
                      transition={{ duration: 0.1 }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute -inset-1.5 rounded-xl bg-primary/15"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <Avatar className={cn(
                        "h-7 w-7 relative z-10 transition-all",
                        isActive && "ring-2 ring-primary"
                      )}>
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-muted">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                  </Link>
                );
              }

              return (
                <NavItem
                  key={item.path}
                  path={item.path}
                  icon={item.icon}
                  label={item.label}
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
      </motion.nav>
    </>
  );
}));
