import { Home, Film, PlusCircle, MessageCircle, Settings, Search } from 'lucide-react';
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
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
    { icon: Settings, labelKey: 'nav.settings', path: '/settings', badge: 0 },
  ];

  return (
    <>
      {/* Mod/Admin Quick Access Menu */}
      <AnimatePresence>
        {showModMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModMenu(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 100 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 100 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="liquid-glass rounded-3xl p-6 w-full max-w-sm mb-20 space-y-4"
            >
              <div className="text-center mb-4">
                <motion.h3 
                  className="text-lg font-bold gradient-text"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {userRole === 'admin' ? 'Admin Panel' : 'Moderation'}
                </motion.h3>
                <motion.p 
                  className="text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  Quick access to your tools
                </motion.p>
              </div>
              
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                onClick={() => {
                  navigate('/admin');
                  setShowModMenu(false);
                }}
                className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-3 hover:scale-[1.02] transition-all"
              >
                <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
                  <span className="text-lg">⚡</span>
                </div>
                <div className="text-left">
                  <p className="font-semibold">{userRole === 'admin' ? 'Admin Dashboard' : 'Moderation Panel'}</p>
                  <p className="text-xs text-muted-foreground">Manage users, content & reports</p>
                </div>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                onClick={() => setShowModMenu(false)}
                className="w-full p-3 rounded-2xl liquid-glass-subtle text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.1 }}
                      className="gradient-animated rounded-xl p-3 liquid-glass-button shadow-lg"
                    >
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </motion.div>
                  </Link>
                  {hasSpecialPerms && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 right-[calc(50%-20px)] w-3 h-3 rounded-full bg-yellow-500 border-2 border-background pointer-events-none"
                    />
                  )}
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
