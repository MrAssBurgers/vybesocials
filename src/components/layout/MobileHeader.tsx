import { Link, useLocation } from 'react-router-dom';
import { Bell, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';

export function MobileHeader() {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const location = useLocation();

  const isNotificationsActive = location.pathname === '/notifications';
  const isProfileActive = location.pathname === `/u/${profile?.username}`;

  // Hide header on clips page for immersive experience
  if (location.pathname === '/clips') {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      <div className="liquid-glass border-b border-foreground/10">
        <div className="flex items-center justify-between h-11 sm:h-14 px-2 sm:px-4 relative z-10">
          {/* Logo - compact on mobile */}
          <Link 
            to="/home" 
            className="flex-shrink-0 flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10"
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          {/* Center - Search - more compact on mobile */}
          <HeaderSearch className="flex-1 mx-1.5 sm:mx-3" />

          {/* Right side - Notifications & Profile only */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 flex-shrink-0">
            {/* Notifications */}
            <Link
              to="/notifications"
              className={cn(
                "relative flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10 rounded-full transition-colors",
                isNotificationsActive ? "bg-primary/20" : "hover:bg-muted/50"
              )}
            >
              <Bell className={cn(
                "h-4.5 w-4.5 sm:h-5 sm:w-5 transition-colors",
                isNotificationsActive ? "text-primary" : "text-foreground"
              )} />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-0.5 right-0.5 h-3 w-3 sm:h-4 sm:w-4 bg-destructive rounded-full flex items-center justify-center text-[7px] sm:text-[9px] text-destructive-foreground font-bold"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Profile */}
            <Link
              to={`/u/${profile?.username}`}
              className="flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10 rounded-full"
            >
              <Avatar className={cn(
                "h-6 w-6 sm:h-8 sm:w-8 transition-all",
                isProfileActive && "ring-2 ring-primary"
              )}>
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] sm:text-xs">
                  {profile?.username?.[0]?.toUpperCase() || <User className="h-3 w-3 sm:h-4 sm:w-4" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}