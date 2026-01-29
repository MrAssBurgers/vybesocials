import { useState, useCallback, useRef, forwardRef, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, Compass, MessageCircle, ShoppingBag, Calendar, Bell, Settings, 
  PlusCircle, Shield, Users, LucideIcon
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
  tutorialId?: string;
}

interface DesktopLeftSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  compact?: boolean;
}

// NavLink component with forwardRef - simplified for performance
const NavLinkContent = memo(forwardRef<
  HTMLAnchorElement,
  {
    item: NavItemData;
    isActive: boolean;
    collapsed: boolean;
    label: string;
  }
>(({ item, isActive, collapsed, label, ...props }, ref) => {
  const Icon = item.icon;
  
  return (
    <Link
      ref={ref}
      to={item.path}
      onClick={triggerNavFeedback}
      data-tutorial={item.tutorialId}
      className={cn(
        "flex items-center gap-3 rounded-xl transition-colors relative group overflow-hidden",
        "active:scale-[0.98] transition-transform duration-100",
        collapsed ? "px-3 py-3 justify-center" : "px-3 py-2.5",
        isActive
          ? "text-sidebar-foreground bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/20"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-sidebar-foreground border border-transparent"
      )}
      {...props}
    >
      {/* Active inner glow */}
      {isActive && (
        <div className="absolute inset-0 rounded-xl pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
        </div>
      )}
      
      <div className="relative z-10 flex-shrink-0">
        <Icon className="h-5 w-5" />
        {item.badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="relative z-10 font-medium truncate flex-1">{label}</span>}
    </Link>
  );
}));
NavLinkContent.displayName = 'NavLinkContent';

export function DesktopLeftSidebar({ collapsed, onCollapsedChange, compact = false }: DesktopLeftSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: userRole } = useUserRole();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const [isHubOpen, setIsHubOpen] = useState(false);
  const lastTapTime = useRef(0);

  // Check if user is admin or moderator
  const showAdminLink = userRole === 'admin' || userRole === 'moderator';

  const { data: myServers = [] } = useMyServers();

  const mainNavItems: NavItemData[] = [
    { icon: Home, labelKey: 'nav.home', path: '/home', badge: 0, tutorialId: 'sidebar-home' },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore', badge: 0, tutorialId: 'sidebar-explore' },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages', badge: unreadMessages, tutorialId: 'sidebar-messages' },
    { icon: Users, label: 'Community', path: '/community', badge: 0, tutorialId: 'sidebar-community' },
    { icon: ShoppingBag, label: 'Market', path: '/market', badge: 0, tutorialId: 'sidebar-market' },
    { icon: Calendar, label: 'Events', path: '/events', badge: 0, tutorialId: 'sidebar-events' },
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
          "hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-40",
          "transition-[width] duration-200 ease-out overflow-hidden",
          "bg-background/60 backdrop-blur-2xl backdrop-saturate-150",
          "border-r border-white/10",
          collapsed 
            ? "w-[72px]" 
            : "w-[200px] xl:w-[220px] 2xl:w-[240px]"
        )}
        data-tutorial-sidebar
      >
        {/* Brand Row */}
        <div className={cn(
          "flex items-center h-16 px-4",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <Link to="/home" className="flex items-center gap-2 group">
            <VYBELogo size={collapsed ? "sm" : "md"} showText={!collapsed} />
          </Link>
        </div>

        {/* Profile Snapshot */}
        {!collapsed && profile && (
          <div className="mx-3 mb-3 space-y-2" data-tutorial="sidebar-profile">
            {/* Profile Link */}
            <Link 
              to={`/u/${profile.username}`} 
              className="flex items-center gap-3 p-3 rounded-xl liquid-glass-subtle hover:bg-white/10 transition-all group"
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary/80 to-accent/80 text-primary-foreground font-semibold">
                  {profile.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                  {profile.username}
                  {isOwner(profile.username) && <OwnerBadge />}
                </p>
                <p className="text-xs text-muted-foreground">View profile</p>
              </div>
            </Link>
            
            {/* Quick Actions */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30">
              <Link
                to="/notifications"
                onClick={triggerNavFeedback}
                className="relative flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground hover:bg-background/50 hover:text-foreground transition-all"
              >
                <Bell className="h-4 w-4" />
                <span className="text-xs font-medium">Alerts</span>
                {unreadNotifications > 0 && (
                  <span className="h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Link>
              
              <div className="w-px h-5 bg-border/50" />
              
              <Link
                to="/settings"
                onClick={triggerNavFeedback}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground hover:bg-background/50 hover:text-foreground transition-all"
              >
                <Settings className="h-4 w-4" />
                <span className="text-xs font-medium">Settings</span>
              </Link>
            </div>
          </div>
        )}

        {!collapsed && !profile && (
          <div className="mx-3 mb-3 p-3 rounded-xl liquid-glass-subtle">
            <p className="text-sm text-muted-foreground text-center">Not signed in</p>
          </div>
        )}

        {collapsed && profile && (
          <div className="flex flex-col items-center gap-1.5 mb-3 px-2">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link to={`/u/${profile.username}`} className="group">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/80 to-accent/80 text-primary-foreground text-sm font-semibold">
                      {profile.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">View Profile</TooltipContent>
            </Tooltip>
            
            {/* Collapsed action buttons */}
            <div className="flex flex-col items-center gap-0.5 p-1 rounded-xl bg-muted/30">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/notifications"
                    onClick={triggerNavFeedback}
                    className="relative p-2 rounded-lg text-muted-foreground hover:bg-background/50 hover:text-foreground transition-all"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadNotifications > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-destructive rounded-full flex items-center justify-center text-[8px] text-destructive-foreground font-bold">
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Notifications</TooltipContent>
              </Tooltip>
              
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/settings"
                    onClick={triggerNavFeedback}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-background/50 hover:text-foreground transition-all"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="mx-3 h-px" />

        {/* Primary Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {mainNavItems.map(renderNavItem)}

          {/* Moderation Section */}
          {showAdminLink && (
            <>
              <div className="my-3 h-px" />
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
        <div className={cn("py-2", collapsed ? "px-2" : "px-3")}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button 
                onClick={handleCreateClick}
                data-tutorial="sidebar-create"
                className={cn(
                  "w-full gradient-animated text-primary-foreground font-semibold rounded-xl",
                  "shadow-lg shadow-primary/20 hover:shadow-primary/30",
                  "active:scale-95 transition-transform",
                  collapsed ? "h-11 px-0 min-w-[48px]" : "h-11"
                )}
              >
                <PlusCircle className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="ml-2">{t('nav.upload')}</span>}
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

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 pb-4 pt-1">
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
              <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
              <span className="text-muted-foreground/50">v1.2</span>
            </div>
          </div>
        )}

        <VYBEHub isOpen={isHubOpen} onClose={() => setIsHubOpen(false)} />
      </aside>
    </TooltipProvider>
  );
}
