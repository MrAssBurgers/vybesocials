import { Home, PlaySquare, PlusCircle, Compass, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';

const navItems = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: PlaySquare, label: 'Shorts', path: '/shorts' },
  { icon: PlusCircle, label: 'Create', path: '/upload', isCreate: true },
  { icon: Compass, label: 'Explore', path: '/explore' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function BottomNav() {
  const location = useLocation();
  const { profile } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border safe-bottom md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === '/profile' && location.pathname.startsWith('/u/'));
          const Icon = item.icon;
          const profilePath = profile ? `/u/${profile.username}` : '/profile';
          const path = item.path === '/profile' ? profilePath : item.path;

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
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
