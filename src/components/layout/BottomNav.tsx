import { Home, Film, PlusCircle, MessageCircle, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useCallback, useRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { CreateMenu } from '@/components/hub/CreateMenu';
import { VYBEHub } from '@/components/hub/VYBEHub';

export function BottomNav() {
  const location = useLocation();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  
  const lastTapTime = useRef(0);
  const lastScrollY = useRef(0);

  // Hide on scroll down, show on scroll up
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (latest) => {
    const diff = latest - lastScrollY.current;
    if (diff > 10 && latest > 50) {
      setIsVisible(false);
    } else if (diff < -5) {
      setIsVisible(true);
    }
    lastScrollY.current = latest;
  });

  const handleCreateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    triggerHaptic('medium');
    playSound('pop');
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 300);
    
    if (timeSinceLastTap < 300) {
      setIsCreateMenuOpen(false);
      setIsHubOpen(true);
    } else {
      setIsCreateMenuOpen(true);
    }
    
    lastTapTime.current = now;
  }, []);

  const navItems = [
    { icon: Home, path: '/home', badge: 0 },
    { icon: Film, path: '/clips', badge: 0 },
    { icon: PlusCircle, path: '/upload', isCreate: true, badge: 0 },
    { icon: MessageCircle, path: '/messages', badge: unreadMessages },
    { icon: User, path: '/profile', badge: 0 },
  ];

  return (
    <>
      <CreateMenu isOpen={isCreateMenuOpen} onClose={() => setIsCreateMenuOpen(false)} />
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <motion.nav 
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : 100 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
      >
        {/* Compact glass bar */}
        <div className="mx-2 mb-2 rounded-2xl bg-background/60 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20">
          <div className="grid grid-cols-5 h-14 px-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              const Icon = item.icon;

              if (item.isCreate) {
                return (
                  <div key={item.path} className="relative flex items-center justify-center">
                    <button
                      className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                      onClick={handleCreateClick}
                    >
                      <AnimatePresence>
                        {showRipple && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0.8 }}
                            animate={{ scale: 2.5, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="absolute inset-0 rounded-xl bg-primary/50 pointer-events-none"
                          />
                        )}
                      </AnimatePresence>
                      
                      <motion.div
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        className="gradient-animated rounded-xl p-2.5 shadow-lg shadow-primary/30"
                      >
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </motion.div>
                    </button>
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                  onClick={triggerNavFeedback}
                >
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="relative p-2"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavPill"
                        className="absolute inset-0 rounded-xl bg-primary/15"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-colors relative z-10",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    
                    <AnimatePresence>
                      {item.badge > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500 }}
                          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20"
                        >
                          {item.badge > 9 ? '9+' : item.badge}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}
