import { Home, Film, PlusCircle, MessageCircle, Settings } from 'lucide-react';
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

// Memoized nav item for better performance with enhanced touch targets
const NavItem = memo(({ 
  path, 
  icon: Icon, 
  badge, 
  isActive 
}: { 
  path: string; 
  icon: typeof Home; 
  badge: number; 
  isActive: boolean;
}) => (
  <Link
    to={path}
    className="relative flex items-center justify-center min-h-[48px] min-w-[48px] active:scale-95 transition-transform duration-150"
    onClick={triggerNavFeedback}
  >
    <div className="relative p-2.5">
      {isActive && (
        <motion.div
          layoutId="bottomNavPill"
          className="absolute inset-0 rounded-xl bg-primary/15 shadow-inner"
          transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
        />
      )}
      
      <motion.div
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 600, damping: 25 }}
      >
        <Icon
          className={cn(
            "h-[22px] w-[22px] relative z-10 transition-colors duration-200",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        />
      </motion.div>
      
      {badge > 0 && (
        <motion.span 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 bg-destructive rounded-full flex items-center justify-center text-[10px] text-destructive-foreground font-bold shadow-lg z-20"
        >
          {badge > 9 ? '9+' : badge}
        </motion.span>
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

  // Updated nav order: Home | Clips | Upload | Messages | Community
  const navItems = [
    { icon: Home, path: '/home', badge: 0 },
    { icon: Film, path: '/clips', badge: 0 },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0 },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages },
    { icon: Settings, path: '/settings', badge: 0 },
  ];

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <motion.nav 
        className="fixed bottom-0 left-0 right-0 z-[2147483647] w-full pb-[env(safe-area-inset-bottom)] pointer-events-auto"
        aria-label="Bottom navigation"
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
        {/* Enhanced glass bar with more padding */}
        <div className="mx-3 mb-3 rounded-2xl liquid-glass border border-foreground/10 shadow-xl shadow-black/25">
          <div className="grid grid-cols-5 h-16 px-2 relative z-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center">
                    <motion.button
                      className="relative flex items-center justify-center min-h-[48px] min-w-[48px]"
                      onClick={handleCreateClick}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                      <div className="gradient-animated rounded-xl p-3 shadow-lg shadow-primary/30">
                        <PlusCircle className="h-[22px] w-[22px] text-primary-foreground" />
                      </div>
                    </motion.button>
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
                />
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}
