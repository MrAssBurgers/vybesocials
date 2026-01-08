import { Home, PlaySquare, PlusCircle, Compass, User, Bell, Settings, LogOut, MessageCircle, Sparkles, Shield } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { useUserRole } from '@/hooks/useModeration';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useUnreadMessagesCount } from '@/hooks/useMessages';

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: userRole } = useUserRole();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();

  // Check if user is admin or moderator OR is mrassburgers
  const isAdminOrMod = userRole === 'admin' || userRole === 'moderator';
  const isMrassburgers = profile?.username?.toLowerCase() === 'mrassburgers';
  const showAdminLink = isAdminOrMod || isMrassburgers;

  const mainNavItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: PlaySquare, labelKey: 'nav.shorts', path: '/shorts', badge: 0 },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
    { icon: Bell, labelKey: 'nav.notifications', path: '/notifications', badge: unreadNotifications },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col bg-sidebar border-r border-sidebar-border p-4">
      {/* Logo */}
      <Link to="/home" className="flex items-center gap-2 px-2 py-4 group">
        <motion.div 
          className="gradient-animated rounded-xl p-2"
          whileHover={{ scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </motion.div>
        <span className="font-display text-2xl font-black gradient-text group-hover:scale-105 transition-transform">XD</span>
      </Link>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 mt-4">
      {mainNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={triggerNavFeedback}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative group",
                isActive
                  ? "text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {/* Animated gradient outline for active state */}
              {isActive && (
                <motion.div
                  layoutId="sidebarNavOutline"
                  className="absolute inset-0 rounded-xl overflow-hidden"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  {/* Animated gradient border */}
                  <div className="absolute inset-0 gradient-border-animated animate-glow-pulse" />
                  {/* Inner background to create border effect */}
                  <div className="absolute inset-[2px] rounded-[10px] bg-sidebar" />
                </motion.div>
              )}
              <div className="relative">
                <Icon className="h-5 w-5 relative z-10" />
                <AnimatePresence>
                  {item.badge > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500 }}
                      className="absolute -top-2 -right-2 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-[10px] text-destructive-foreground font-bold shadow-md z-20"
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <span className="font-medium relative z-10">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Create Button */}
        <Link to="/upload" className="block mt-4" onClick={triggerNavFeedback}>
          <Button className="w-full gradient-animated text-primary-foreground font-semibold h-12 rounded-xl">
            <PlusCircle className="h-5 w-5 mr-2" />
            {t('nav.upload')}
          </Button>
        </Link>
      </nav>

      {/* Bottom Section */}
      <div className="space-y-2 border-t border-sidebar-border pt-4">
        <Link
          to={profile ? `/u/${profile.username}` : '/profile'}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {profile?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium flex items-center gap-1.5">
            {profile?.username || t('nav.profile')}
            {isOwner(profile?.username) && <OwnerBadge />}
          </span>
        </Link>

        <div className="px-4 py-2">
          <FeedbackButton />
        </div>

        {showAdminLink && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
          >
            <Shield className="h-5 w-5" />
            <span className="font-medium">Admin</span>
          </Link>
        )}

        <Link
          to="/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all"
        >
          <Settings className="h-5 w-5" />
          <span className="font-medium">{t('nav.settings')}</span>
        </Link>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all w-full"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">{t('auth.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
