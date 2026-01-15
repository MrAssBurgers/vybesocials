import { Home, Compass, PlusCircle, MessageCircle, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef, memo, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenu } from '@/components/hub/CreateMenu';
import { VYBEHub } from '@/components/hub/VYBEHub';

// Singleton scroll direction detection to prevent duplicate listeners
let scrollDirectionListener: (() => void) | null = null;
let scrollVisibility = true;
const scrollVisibilityListeners = new Set<(visible: boolean) => void>();

function setupScrollDirectionListener() {
  if (scrollDirectionListener) return;
  
  let lastScrollY = 0;
  let ticking = false;

  const handleScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const scrollDiff = currentScrollY - lastScrollY;
        
        if (Math.abs(scrollDiff) > 10) {
          if (scrollDiff > 0 && currentScrollY > 50) {
            scrollVisibility = false;
          } else {
            scrollVisibility = true;
          }
        }
        
        if (currentScrollY < 50) {
          scrollVisibility = true;
        }
        
        lastScrollY = currentScrollY;
        ticking = false;
        
        // Notify all listeners
        scrollVisibilityListeners.forEach(fn => fn(scrollVisibility));
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  scrollDirectionListener = () => {
    window.removeEventListener('scroll', handleScroll);
    scrollDirectionListener = null;
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
      // Only cleanup if no more listeners
      if (scrollVisibilityListeners.size === 0 && scrollDirectionListener) {
        scrollDirectionListener();
      }
    };
  }, []);

  return isVisible;
}

// Memoized nav item for better performance
const NavItem = memo(({ 
  path, 
  icon: Icon, 
  badge, 
  isActive,
  tutorialId,
}: { 
  path: string; 
  icon: typeof Home; 
  badge: number; 
  isActive: boolean;
  tutorialId?: string;
}) => (
  <Link
    to={path}
    className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
    onClick={triggerNavFeedback}
    data-tutorial={tutorialId}
  >
    <div className="relative p-2">
      {isActive && (
        <motion.div
          layoutId="bottomNavPill"
          className="absolute inset-0 rounded-xl bg-primary/15"
          transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
        />
      )}
      
      <Icon
        className={cn(
          "h-5 w-5 relative z-10",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
  </Link>
));

export function BottomNav() {
  const location = useLocation();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const isVisible = useScrollDirection();

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  
  const lastTapTime = useRef(0);

  // Tutorial event listeners for controlling menus
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

    window.addEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
    window.addEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
    window.addEventListener('tutorial-close-menus', handleCloseMenus);

    return () => {
      window.removeEventListener('tutorial-open-create-menu', handleOpenCreateMenu);
      window.removeEventListener('tutorial-open-vybe-hub', handleOpenVYBEHub);
      window.removeEventListener('tutorial-close-menus', handleCloseMenus);
    };
  }, []);

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    triggerHaptic('medium');
    playSound('pop');
    
    if (timeSinceLastTap < 300) {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    } else {
      setIsCreateMenuOpen(true);
    }
    
    lastTapTime.current = now;
  }, []);

  // Updated nav order: Home | Clips | Upload | Messages | Settings
  const navItems = [
    { icon: Home, path: '/home', badge: 0, tutorialId: 'home-nav' },
    { icon: Compass, path: '/clips', badge: 0, tutorialId: 'clips-nav' },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0, tutorialId: 'create-nav' },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages, tutorialId: 'messages-nav' },
    { icon: Settings, path: '/settings', badge: 0, tutorialId: 'settings-nav' },
  ];

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <motion.nav 
        className="fixed bottom-0 left-0 right-0 z-[2147483647] w-full pointer-events-auto"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
        aria-label="Bottom navigation"
        data-tutorial-bottomnav
        initial={false}
        animate={{
          y: isVisible ? 0 : 100,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
      >
        {/* Compact glass bar */}
        <div className="mx-2 mb-2 rounded-2xl liquid-glass border border-foreground/15 shadow-lg shadow-black/30">
          <div className="grid grid-cols-5 h-14 px-1 relative z-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center" data-tutorial="create-nav">
                    <button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                      onClick={handleCreateClick}
                    >
                      <div className="gradient-animated rounded-xl p-2.5 shadow-lg shadow-primary/30 active:scale-90 transition-transform">
                        <PlusCircle className="h-5 w-5 text-primary-foreground" />
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
                />
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}
