import { Home, PlaySquare, PlusCircle, Compass, User, Bell, Settings, LogOut, MessageCircle, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const mainNavItems = [
    { icon: Home, labelKey: 'nav.home', path: '/home' },
    { icon: PlaySquare, labelKey: 'nav.shorts', path: '/shorts' },
    { icon: Compass, labelKey: 'nav.explore', path: '/explore' },
    { icon: Bell, labelKey: 'nav.notifications', path: '/notifications' },
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
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative group",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebarIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary"
                />
              )}
              <Icon className="h-5 w-5" />
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {/* Create Button */}
        <Link to="/upload" className="block mt-4">
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
          <span className="font-medium">{profile?.username || t('nav.profile')}</span>
        </Link>

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
