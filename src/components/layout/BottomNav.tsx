import { Home, Film, PlusCircle, Compass, MessageCircle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useUserRole } from '@/hooks/useModeration';
import { useState, useRef, useCallback } from 'react';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: userRole } = useUserRole();
  
  const [showModMenu, setShowModMenu] = useState(false);
  const lastClickTime = useRef<number>(0);

  const hasSpecialPerms = userRole === 'admin' || userRole === 'moderator';

  // Double-click handler for upload button
  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;
    
    if (hasSpecialPerms && timeSinceLastClick < 300) {
      // Double click detected
      e.preventDefault();
      setShowModMenu(true);
      triggerNavFeedback();
    } else {
      triggerNavFeedback();
    }
    
    lastClickTime.current = now;
  }, [hasSpecialPerms]);

  const navItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: Film, labelKey: 'nav.clips', path: '/clips', badge: 0 },
    { icon: PlusCircle, labelKey: 'nav.upload', path: '/upload', isCreate: true, badge: 0 },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
  ];

  return (
    <>
      {/* Mod/Admin Quick Access Menu */}
      <AnimatePresence>
        {showModMenu && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 z-[60] flex items-end justify-center p-4"
            onClick={() => setShowModMenu(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="liquid-glass rounded-3xl p-6 w-full max-w-sm mb-20 space-y-4"
            >
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold gradient-text">
                  {userRole === 'admin' ? 'Admin Panel' : 'Moderation'}
                </h3>
                <p className="text-sm text-muted-foreground">Quick access to your tools</p>
              </div>
              
              <button
                onClick={() => {
                  navigate('/admin');
                  setShowModMenu(false);
                }}
                className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-3 hover:bg-primary/20 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
                  <span className="text-lg">⚡</span>
                </div>
                <div className="text-left">
                  <p className="font-semibold">{userRole === 'admin' ? 'Admin Dashboard' : 'Moderation Panel'}</p>
                  <p className="text-xs text-muted-foreground">Manage users, content & reports</p>
                </div>
              </button>

              <button
                onClick={() => setShowModMenu(false)}
                className="w-full p-3 rounded-2xl liquid-glass-subtle text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 z-50 liquid-glass border-t border-white/10 safe-bottom md:hidden">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const Icon = item.icon;
            const path = item.path;

            if (item.isCreate) {
              return (
                <Link
                  key={item.path}
                  to={path}
                  className="relative flex items-center justify-center"
                  onClick={handleUploadClick}
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className="gradient-animated rounded-xl p-3 liquid-glass-button"
                  >
                    <Icon className="h-6 w-6 text-primary-foreground" />
                  </motion.div>
                  {hasSpecialPerms && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 border-2 border-background"
                    />
                  )}
                </Link>
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
                      "h-6 w-6 transition-colors relative z-10",
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
