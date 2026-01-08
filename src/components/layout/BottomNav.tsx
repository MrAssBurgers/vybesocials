import { Home, PlaySquare, PlusCircle, Compass, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { useUnreadMessagesCount } from '@/hooks/useMessages';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();

  const navItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: PlaySquare, labelKey: 'nav.shorts', path: '/shorts', badge: 0 },
    { icon: PlusCircle, labelKey: 'nav.upload', path: '/upload', isCreate: true, badge: 0 },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border safe-bottom md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            location.pathname.startsWith(item.path + '/');
          const Icon = item.icon;
          const path = item.path;

          if (item.isCreate) {
            return (
              <Link
                key={item.path}
                to={path}
                className="relative flex items-center justify-center"
                onClick={triggerNavFeedback}
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="gradient-animated rounded-xl p-3"
                >
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </motion.div>
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
                {/* Animated gradient outline for active state */}
                {isActive && (
                  <motion.div
                    layoutId="bottomNavOutline"
                    className="absolute -inset-2 rounded-xl overflow-hidden"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    {/* Animated gradient border with pulse glow */}
                    <div className="absolute inset-0 gradient-border-animated animate-glow-pulse" />
                    {/* Inner background to create border effect */}
                    <div className="absolute inset-[2px] rounded-[10px] bg-background" />
                  </motion.div>
                )}
                
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors relative z-10",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                
                {/* Badge for unread count */}
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
  );
}
