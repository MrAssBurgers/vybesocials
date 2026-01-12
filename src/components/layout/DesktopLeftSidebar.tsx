import { useState, useCallback, useRef, forwardRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, Film, Compass, MessageCircle, ShoppingBag, Calendar, Bell, Settings, 
  LogOut, PlusCircle, Shield, ChevronLeft, ChevronRight, Users, LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { triggerNavFeedback } from '@/lib/navFeedback';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { useUserRole } from '@/hooks/useModeration';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { VYBEHub } from '@/components/hub/VYBEHub';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMyServers } from '@/hooks/useServers';

interface NavItemData {
  icon: LucideIcon;
  label?: string;
  labelKey?: string;
  path: string;
  badge: number;
}

interface DesktopLeftSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

// NavLink component with forwardRef - liquid glass styling
const NavLinkContent = forwardRef<
  HTMLAnchorElement,
  {
    item: NavItemData;
    isActive: boolean;
    collapsed: boolean;
    label: string;
  }
>(({ item, isActive, collapsed, label, ...props }, ref) => {
  const Icon = item.icon;
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      animate={{
        scale: isPressed ? 0.97 : isHovered ? 1.01 : 1,
      }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
    >
      <Link
        ref={ref}
        to={item.path}
        onClick={triggerNavFeedback}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative group overflow-hidden backdrop-blur-sm",
          isActive
            ? "text-sidebar-foreground bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/20"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-sidebar-foreground border border-transparent"
        )}
        {...props}
      >
        {/* Glossy sheen on hover */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-xl"
          initial={{ opacity: 0, x: '-100%' }}
          animate={isHovered && !isActive ? { opacity: 1, x: '100%' } : { opacity: 0, x: '-100%' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{
            background: 'linear-gradient(105deg, transparent 30%, hsl(var(--foreground) / 0.06) 50%, transparent 70%)',
          }}
        />
        
        {/* Active inner glow */}
        {isActive && (
          <div className="absolute inset-0 rounded-xl pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
          </div>
        )}
        
        <div className="relative z-10">
          <Icon className="h-5 w-5 transition-transform" />
          <AnimatePresence>
            {item.badge > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold"
              >
                {item.badge > 9 ? '9+' : item.badge}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {!collapsed && <span className="relative z-10 font-medium truncate">{label}</span>}
      </Link>
    </motion.div>
  );
});
NavLinkContent.displayName = 'NavLinkContent';

export function DesktopLeftSidebar({ collapsed, onCollapsedChange }: DesktopLeftSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: userRole } = useUserRole();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const [isHubOpen, setIsHubOpen] = useState(false);
  const lastTapTime = useRef(0);

  const isAdminOrMod = userRole === 'admin' || userRole === 'moderator';
  const isMrassburgers = profile?.username?.toLowerCase() === 'mrassburgers';
  const showAdminLink = isAdminOrMod || isMrassburgers;

  const { data: myServers = [] } = useMyServers();

  const mainNavItems: NavItemData[] = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0 },
    { icon: Film, labelKey: 'nav.clips', path: '/clips', badge: 0 },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages },
    { icon: Users, label: 'Community', path: '/community', badge: 0 },
    { icon: ShoppingBag, label: 'Market', path: '/market', badge: 0 },
    { icon: Calendar, label: 'Events', path: '/events', badge: 0 },
    { icon: Bell, labelKey: 'nav.notifications', path: '/notifications', badge: unreadNotifications },
    { icon: Settings, labelKey: 'nav.settings', path: '/settings', badge: 0 },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleCreateClick = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    triggerHaptic('medium');
    playSound('pop');
    
    // Double-click goes to admin panel (if authorized)
    if (timeSinceLastTap < 300 && showAdminLink) {
      navigate('/admin');
    } else {
      navigate('/upload');
    }
    
    lastTapTime.current = now;
  }, [navigate, showAdminLink]);

  const renderNavItem = (item: NavItemData) => {
    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    const label = item.labelKey ? t(item.labelKey) : item.label || '';

    if (collapsed) {
      return (
        <Tooltip key={item.path} delayDuration={0}>
          <TooltipTrigger asChild>
            <NavLinkContent item={item} isActive={isActive} collapsed={collapsed} label={label} />
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {label}
            {item.badge > 0 && <span className="ml-2 text-destructive">({item.badge})</span>}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <NavLinkContent key={item.path} item={item} isActive={isActive} collapsed={collapsed} label={label} />;
  };

  return (
    <TooltipProvider>
      <aside 
        className={cn(
          "hidden lg:flex fixed left-0 top-0 h-screen flex-col liquid-glass border-r border-border/50 z-40",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-16" : "w-[220px] xl:w-[240px] 2xl:w-[260px]"
        )}
      >
        {/* Brand Row */}
        <div className={cn("flex items-center p-4", collapsed ? "justify-center" : "gap-3")}>
          <Link to="/home" className="flex items-center gap-2 group">
            <VYBELogo size={collapsed ? "sm" : "md"} showText={!collapsed} />
          </Link>
        </div>

        {/* Profile Snapshot */}
        {!collapsed && profile && (
          <Link 
            to={`/u/${profile.username}`}
            className="mx-3 mb-3 p-3 rounded-xl liquid-glass-subtle hover:bg-sidebar-accent/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="bg-secondary">
                  {profile.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate flex items-center gap-1">
                  {profile.username}
                  {isOwner(profile.username) && <OwnerBadge />}
                </p>
                <p className="text-xs text-muted-foreground">@{profile.username}</p>
              </div>
            </div>
          </Link>
        )}

        {!collapsed && !profile && (
          <div className="mx-3 mb-3 p-3 rounded-xl liquid-glass-subtle">
            <p className="text-sm text-muted-foreground text-center">Not signed in</p>
          </div>
        )}

        {collapsed && profile && (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link to={`/u/${profile.username}`} className="mx-auto mb-3">
                <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-xs">
                    {profile.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">View Profile</TooltipContent>
          </Tooltip>
        )}

        <Separator className="mx-3 bg-border/50" />

        {/* Primary Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {mainNavItems.map(renderNavItem)}

          {/* Moderation Section */}
          {showAdminLink && (
            <>
              <Separator className="my-3 bg-border/50" />
              {!collapsed && (
                <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Moderation
                </p>
              )}
              {renderNavItem({ icon: Shield, label: 'Admin Panel', path: '/admin', badge: 0 })}
            </>
          )}
        </nav>

        {/* Create Area */}
        <div className="px-3 py-2">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button 
                onClick={handleCreateClick}
                className={cn(
                  "w-full gradient-animated text-primary-foreground font-semibold rounded-xl",
                  "shadow-lg shadow-primary/20 hover:shadow-primary/30",
                  "active:scale-95 transition-transform",
                  collapsed ? "h-10 px-0" : "h-11"
                )}
              >
                <PlusCircle className={cn("h-5 w-5", collapsed ? "" : "mr-2")} />
                {!collapsed && t('nav.upload')}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Upload (double-click for Admin)</TooltipContent>}
          </Tooltip>
        </div>

        {/* Communities Section - Show user's servers */}
        {!collapsed && (
          <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Communities
              </span>
              <Link to="/community" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            {myServers.length > 0 ? (
              <div className="space-y-1">
                {myServers.slice(0, 4).map((server) => (
                  <Link
                    key={server.id}
                    to={`/community?server=${server.id}`}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-sidebar-accent/30 transition-all"
                  >
                    <Avatar className="h-8 w-8">
                      {server.icon_url ? (
                        <AvatarImage src={server.icon_url} />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs">
                          {server.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-sm font-medium truncate">{server.name}</span>
                  </Link>
                ))}
                {myServers.length > 4 && (
                  <Link to="/community" className="block text-center text-xs text-muted-foreground hover:text-foreground py-1">
                    +{myServers.length - 4} more
                  </Link>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle text-center">
                <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">
                  You're not in any communities yet
                </p>
                <Link to="/community" className="text-xs text-primary hover:underline mt-1 block">
                  Browse servers
                </Link>
              </div>
            )}
          </div>
        )}

        <Separator className="mx-3 bg-border/50" />

        {/* Collapse Control */}
        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn("w-full justify-center", collapsed ? "" : "justify-start gap-2")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span className="text-sm">Collapse</span>}
          </Button>
        </div>

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 pb-3 pt-1">
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Help</a>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <div className="px-3 pb-4">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground",
                  "hover:bg-destructive/10 hover:text-destructive transition-all w-full",
                  collapsed ? "justify-center" : ""
                )}
              >
                <LogOut className="h-5 w-5" />
                {!collapsed && <span className="font-medium">{t('auth.logout')}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
          </Tooltip>
        </div>

        <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />
      </aside>
    </TooltipProvider>
  );
}
