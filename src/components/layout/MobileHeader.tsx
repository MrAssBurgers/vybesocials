import { Link, useLocation } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function MobileHeader() {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const location = useLocation();

  const isNotificationsActive = location.pathname === '/notifications';
  const isProfileActive = location.pathname === `/u/${profile?.username}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 md:hidden">
      <div className="liquid-glass border-b border-white/10">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Logo */}
          <Link to="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg liquid-glass flex items-center justify-center">
              <span className="text-sm font-bold gradient-text">XD</span>
            </div>
          </Link>

          {/* Right side - Notifications & Profile */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <Link
              to="/notifications"
              className={cn(
                "relative p-2 rounded-full transition-colors liquid-glass-subtle",
                isNotificationsActive && "bg-primary/20"
              )}
            >
              <Bell className={cn(
                "h-5 w-5 transition-colors",
                isNotificationsActive ? "text-primary" : "text-foreground"
              )} />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Profile */}
            <Link
              to={`/u/${profile?.username}`}
              className={cn(
                "rounded-full transition-all",
                isProfileActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              <Avatar className="h-8 w-8 liquid-glass-subtle">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {profile?.username?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}