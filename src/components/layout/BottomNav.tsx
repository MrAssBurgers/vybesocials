import { Home, PlaySquare, PlusCircle, Compass, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { profile } = useAuth();

  const navItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home' },
    { icon: PlaySquare, labelKey: 'nav.shorts', path: '/shorts' },
    { icon: PlusCircle, labelKey: 'nav.upload', path: '/upload', isCreate: true },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore' },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages' },
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
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="relative"
              >
                <Icon
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  />
                )}
              </motion.div>
              <span
                className={cn(
                  "text-[10px] font-medium",
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
