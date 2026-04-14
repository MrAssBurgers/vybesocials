import { Home, Compass, Plus, MessageCircle, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, memo, useEffect, forwardRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { useAuth } from '@/lib/auth';
import { navVisibility } from '@/lib/navVisibility';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Singleton scroll direction detection
let scrollDirectionCleanup: (() => void) | null = null;
let scrollVisibility = true;
const scrollVisibilityListeners = new Set<(visible: boolean) => void>();

function setupScrollDirectionListener() {
  if (scrollDirectionCleanup) return;
  let lastScrollY = 0;
  let ticking = false;

  const handleScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('[data-app-scroll-container="true"]');
      const currentScrollY = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
      const scrollDiff = currentScrollY - lastScrollY;
      if (Math.abs(scrollDiff) > 10) {
        scrollVisibility = !(scrollDiff > 0 && currentScrollY > 50);
      }
      if (currentScrollY < 50) scrollVisibility = true;
      lastScrollY = currentScrollY;
      ticking = false;
      scrollVisibilityListeners.forEach(fn => fn(scrollVisibility));
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  const observer = new MutationObserver(() => {
    const container = document.querySelector('[data-app-scroll-container="true"]');
    if (container && !(container as any).__scrollBound) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      (container as any).__scrollBound = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
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

function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    setupScrollDirectionListener();
    scrollVisibilityListeners.add(setIsVisible);
    setIsVisible(scrollVisibility);
    return () => {
      scrollVisibilityListeners.delete(setIsVisible);
      if (scrollVisibilityListeners.size === 0 && scrollDirectionCleanup) scrollDirectionCleanup();
    };
  }, []);
  return isVisible;
}

function useNavVisibility() {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    return navVisibility.subscribe(setIsVisible);
  }, []);
  return isVisible;
}

const NAV_ITEMS = [
  { id: 'home', icon: Home, path: '/home', label: 'Home', tutorial: 'home-nav' },
  { id: 'explore', icon: Compass, path: '/explore', label: 'Explore', tutorial: 'explore-nav' },
  { id: 'create', path: '/upload', label: 'Create', tutorial: 'create-nav', isCreate: true },
  { id: 'messages', icon: MessageCircle, path: '/messages', label: 'Messages', tutorial: 'messages-nav', requiresAuth: true },
  { id: 'profile', label: 'Profile', tutorial: 'profile-nav', isProfile: true },
] as const;

export const BottomNav = memo(forwardRef<HTMLElement, object>(function BottomNav(_props, ref) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const scrollVisible = useScrollDirection();
  const navCentralVisible = useNavVisibility();
  const isVisible = scrollVisible && navCentralVisible;
  const onboardingComplete = profile?.onboarding_completed === true;

  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState('');

  if (!onboardingComplete && !isGuest) return null;

  const profilePath = profile ? `/u/${profile.username}` : '/settings';

  return (
    <>
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
        animate={{ y: isVisible ? 0 : 120, opacity: isVisible ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.9 }}
        style={{
          zIndex: 5002,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
        aria-label="Bottom navigation"
        data-tutorial-bottomnav
      >
        <div
          className="mx-3 mb-2 rounded-[20px] overflow-hidden border border-border/20"
          style={{
            background: 'hsl(var(--card))',
            boxShadow: '0 -2px 20px hsl(var(--foreground) / 0.08)',
          }}
        >
          <div className="grid grid-cols-5 h-14 px-1">
            {NAV_ITEMS.map((item) => {
              if (item.isCreate) {
                return (
                  <div key={item.id} className="relative flex items-center justify-center" data-tutorial={item.tutorial}>
                    <motion.button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation"
                      onClick={() => {
                        if (isGuest) {
                          setAuthPromptAction('create posts');
                          setShowAuthPrompt(true);
                          return;
                        }
                        triggerHaptic('medium');
                        navigate('/upload');
                      }}
                      whileTap={{ scale: 0.85 }}
                    >
                      <div className="rounded-2xl p-2.5 create-button-gradient">
                        <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
                      </div>
                    </motion.button>
                  </div>
                );
              }

              if (item.isProfile) {
                const isActive = location.pathname === profilePath || location.pathname.startsWith(profilePath + '/');
                return (
                  <div key={item.id} className="relative flex items-center justify-center" data-tutorial={item.tutorial}>
                    <Link
                      to={profilePath}
                      className="relative flex items-center justify-center min-h-[48px] w-full"
                      onClick={() => triggerNavFeedback()}
                    >
                      <motion.div className="relative" whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}>
                        {isActive && (
                          <motion.div
                            layoutId="nav-indicator"
                            className="absolute -inset-1.5 rounded-xl bg-primary/15"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <Avatar className={cn("h-7 w-7 relative z-10 transition-all", isActive && "ring-2 ring-primary")}>
                          <AvatarImage src={profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px] bg-muted">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      </motion.div>
                    </Link>
                  </div>
                );
              }

              const path = item.path;
              const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
              const badge = item.id === 'messages' ? unreadMessages : 0;
              const Icon = item.icon!;

              return (
                <div key={item.id} className="relative flex items-center justify-center" data-tutorial={item.tutorial}>
                  <Link
                    to={path}
                    className="relative flex items-center justify-center min-h-[48px] w-full group"
                    onClick={(e) => {
                      if (item.requiresAuth && isGuest) {
                        e.preventDefault();
                        setAuthPromptAction('send messages');
                        setShowAuthPrompt(true);
                      } else {
                        triggerNavFeedback();
                      }
                    }}
                  >
                    <motion.div className="relative" whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}>
                      {isActive && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute -inset-1.5 rounded-xl bg-primary/15"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
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
                </div>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}));
