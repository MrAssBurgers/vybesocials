import { Link, useLocation } from 'react-router-dom';
import { Bell, User, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';

export function MobileHeader() {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: unreadMessagesCount = 0 } = useUnreadMessagesCount();
  const location = useLocation();

  const isNotificationsActive = location.pathname === '/notifications';
  const isMessagesActive = location.pathname.startsWith('/messages');
  const isProfileActive = location.pathname === `/u/${profile?.username}`;

  // Hide header on clips page for immersive experience
  if (location.pathname === '/clips') {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      <div className="liquid-glass border-b border-foreground/10">
        <div className="flex items-center justify-between h-12 sm:h-14 px-2 sm:px-4 relative z-10">
          {/* Logo - consistent size with other icons */}
          <Link 
            to="/home" 
            className="flex-shrink-0 flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10"
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          {/* Center - Search */}
          <HeaderSearch className="flex-1 mx-2 sm:mx-3" />

          {/* Right side - Messages, Notifications & Profile - consistent sizing */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Messages with unread badge */}
            <Link
              to="/messages"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full transition-colors",
                isMessagesActive ? "bg-primary/20" : "hover:bg-muted/50"
              )}
            >
              <MessageCircle className={cn(
                "h-5 w-5 transition-colors",
                isMessagesActive ? "text-primary" : "text-foreground"
              )} />
              <AnimatePresence>
                {unreadMessagesCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-0.5 -right-0.5 h-5 w-5 sm:h-5.5 sm:w-5.5 bg-destructive rounded-full flex items-center justify-center text-[10px] sm:text-[11px] text-destructive-foreground font-bold shadow-lg ring-2 ring-background"
                  >
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Notifications - same hitbox as other icons */}
            <Link
              to="/notifications"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full transition-colors",
                isNotificationsActive ? "bg-primary/20" : "hover:bg-muted/50"
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
                    className="absolute top-1 right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 bg-destructive rounded-full flex items-center justify-center text-[8px] sm:text-[9px] text-destructive-foreground font-bold"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Profile - snug ring that matches avatar size exactly */}
            <Link
              to={`/u/${profile?.username}`}
              className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full"
            >
              <Avatar className={cn(
                "h-7 w-7 sm:h-8 sm:w-8 transition-all",
                isProfileActive && "ring-2 ring-primary"
              )}>
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {profile?.username?.[0]?.toUpperCase() || <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}