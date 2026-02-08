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
      <div className="liquid-glass border-b border-foreground/5">
        <div className="flex items-center justify-between h-14 px-3 relative z-10">
          {/* Logo - clean and minimal */}
          <Link 
            to="/home" 
            className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/30 transition-colors"
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          {/* Center - Search - clean styling */}
          <HeaderSearch className="flex-1 mx-3" />

          {/* Right side - Notifications & Profile */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Notifications */}
            <Link
              to="/notifications"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all",
                isNotificationsActive 
                  ? "bg-primary/15 text-primary" 
                  : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <Bell className="h-5 w-5" />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-sm"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Profile */}
            <Link
              to={`/u/${profile?.username}`}
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/30 transition-colors"
            >
              <Avatar className={cn(
                "h-7 w-7 transition-all",
                isProfileActive && "ring-2 ring-primary ring-offset-1 ring-offset-background"
              )}>
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-muted">
                  {profile?.username?.[0]?.toUpperCase() || <User className="h-3.5 w-3.5" />}
                </AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}