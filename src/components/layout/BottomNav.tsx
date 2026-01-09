import { Home, Film, PlusCircle, MessageCircle, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useState, useRef, useCallback } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { VYBEHub } from '@/components/hub/VYBEHub';

const DOUBLE_TAP_THRESHOLD = 300;

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const lastTapTime = useRef(0);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleDoubleTap = useCallback(() => {
    triggerHaptic('medium');
    playSound('pop');
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 300);
    setIsHubOpen(true);
  }, []);

  const handleSingleTap = useCallback(() => {
    triggerNavFeedback();
  }, []);

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }

    if (timeSinceLastTap < DOUBLE_TAP_THRESHOLD) {
      // Double-tap - prevent navigation and open hub
      e.preventDefault();
      lastTapTime.current = 0;
      handleDoubleTap();
    } else {
      // Might be single tap - wait to confirm then navigate normally
      lastTapTime.current = now;
      tapTimeout.current = setTimeout(() => {
        handleSingleTap();
        tapTimeout.current = null;
      }, DOUBLE_TAP_THRESHOLD);
    }
  }, [handleDoubleTap, handleSingleTap]);

  const navItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: Film, labelKey: 'nav.clips', path: '/clips', badge: 0 },
    { icon: PlusCircle, labelKey: 'nav.upload', path: '/upload', isCreate: true, badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
    { icon: Settings, labelKey: 'nav.settings', path: '/settings', badge: 0 },
  ];

  return (
    <>
      {/* VYBE Hub - opens on double-tap of create button */}
      <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />

      <nav className="fixed bottom-0 left-0 right-0 z-50 liquid-glass border-t border-white/10 safe-bottom lg:hidden">
        <div className="grid grid-cols-5 h-16 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const Icon = item.icon;
            const path = item.path;

            if (item.isCreate) {
              return (
                <div key={item.path} className="relative flex items-center justify-center">
                  <Link
                    to={path}
                    className="relative flex items-center justify-center"
                    onClick={handleUploadClick}
                  >
                    {/* Ripple effect on double-tap */}
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
                      whileHover={{ scale: 1.1 }}
                      className="gradient-animated rounded-xl p-3 liquid-glass-button shadow-lg"
                    >
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </motion.div>
                  </Link>
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={path}
                className="relative flex flex-col items-center justify-center gap-1 py-2"
                onClick={triggerNavFeedback}
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="relative"
                >
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavOutline"
                      className="absolute -inset-2 rounded-xl overflow-hidden"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      <div className="absolute inset-0 gradient-border-animated animate-glow-pulse" />
                      <div className="absolute inset-[2px] rounded-[10px] bg-background" />
                    </motion.div>
                  )}
                  
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-all relative z-10",
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
                        className="absolute -top-1 -right-1 h-4 w-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-md z-20"
                      >
                        {item.badge > 9 ? '9+' : item.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
