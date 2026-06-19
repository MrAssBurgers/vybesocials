import { Home, Film, PlusCircle, Compass, Bell, Settings, LogOut, MessageCircle, Shield, Crown, Wallet, ShoppingBag, Dna, Radio } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { useUserRole } from '@/hooks/useModeration';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: userRole } = useUserRole();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { isPremium } = usePremiumStatus();

  // Check if user is owner, admin, or moderator
  const showAdminLink = userRole === 'owner' || userRole === 'admin' || userRole === 'moderator';


  const mainNavItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: Film, labelKey: 'nav.clips', path: '/clips', badge: 0 },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <aside data-no-auto-contrast className="hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col stable-sidebar-surface border-r border-border/40 shadow-2xl shadow-background/30 p-4 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 py-4">
        <Link to="/home" className="group">
          <VYBELogo size="lg" />
        </Link>
      </div>

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
                  : "text-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {/* Static active state: avoids hover/background shimmer */}
              {isActive && (
                <motion.div
                  layoutId="sidebarNavOutline"
                  className="absolute inset-0 rounded-xl bg-sidebar-accent border border-primary/20"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
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

        {/* Discovery Section */}
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(90deg, transparent 5%, hsl(var(--border) / 0.15) 50%, transparent 95%) 1' }}>
          <span className="px-4 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Discover</span>
          {[
            { icon: Wallet, label: 'Wallet', path: '/wallet' },
            { icon: ShoppingBag, label: 'Shop', path: '/marketplace' },
            { icon: Dna, label: 'VYBE DNA', path: '/vybe-dna' },
            { icon: Radio, label: 'Communities', path: '/community' },
          ].map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={triggerNavFeedback}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm",
                  isActive
                    ? "text-sidebar-foreground bg-sidebar-accent/30"
                    : "text-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Create Button */}
        <Link to="/upload" className="block mt-4" onClick={triggerNavFeedback}>
          <Button variant="gradient" className="w-full h-12 rounded-xl hover:scale-[1.02] transition-transform">
            <PlusCircle className="h-5 w-5 mr-2" />
            {t('nav.upload')}
          </Button>
        </Link>
      </nav>

      {/* Bottom Section */}
      <div className="space-y-3 pt-4" style={{ borderTop: '1px solid transparent', borderImage: 'linear-gradient(90deg, transparent 5%, hsl(var(--border) / 0.25) 50%, transparent 95%) 1' }}>
        {/* Profile Card */}
        <Link
          to={profile ? `/u/${profile.username}` : '/profile'}
          className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors group"
        >
          <Avatar className="h-9 w-9 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
            <ProfileAvatarImage profileId={profile?.id} src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary/80 to-accent/80 text-primary-foreground font-semibold">
              {profile?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm flex items-center gap-1.5 truncate">
              {profile ? (
                <StyledUsername
                  userId={profile.id}
                  username={profile.username}
                  displayName={profile.display_name}
                  preferDisplayName={false}
                  showAtSymbol
                  className="truncate"
                />
              ) : (
                t('nav.profile')
              )}
              {isOwner(profile?.username) && <OwnerBadge />}
            </span>
            <span className="text-xs text-muted-foreground">View profile</span>
          </div>
        </Link>
        
        {/* Quick Actions Row */}
        <div className="flex items-center gap-1.5 mx-2 p-1 rounded-xl bg-muted/30">
          <Link
            to="/notifications"
            onClick={triggerNavFeedback}
            className="relative flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span className="text-xs font-medium">Alerts</span>
            <AnimatePresence>
              {unreadNotifications > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500 }}
                  className="absolute top-1 right-1 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold"
                >
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
          
          <div className="w-px h-6 bg-border/50" />
          
          <Link
            to="/settings"
            onClick={triggerNavFeedback}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-medium">Settings</span>
          </Link>
        </div>

        <div className="px-4 py-2">
          <FeedbackButton />
        </div>

        {showAdminLink && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-sidebar-foreground transition-all"
          >
            <Shield className="h-5 w-5" />
            <span className="font-medium">Admin</span>
          </Link>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all w-full">
              <LogOut className="h-5 w-5" />
              <span className="font-medium">{t('auth.logout')}</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out?</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to log out of your account?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Log out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  );
}
