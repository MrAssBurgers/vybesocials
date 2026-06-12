import { useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Flag, AlertTriangle, Users, Ban, Crown, Megaphone, 
  Award, Activity, Calendar, Handshake, ImageIcon, ChevronRight,
  BarChart3, MessageSquareWarning, Settings, Menu, X, ArrowLeft, Bug
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useUserRole, useReports, useContentFlags, useAllUserRoles } from '@/hooks/useModeration';
import { useAllWarnings, useAllBans } from '@/hooks/useModerationActions';
import { useAuth } from '@/lib/auth';
import { isModOrAdminRole, isStaffGateLoading } from '@/lib/adminAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { cn } from '@/lib/utils';

// Admin sections
import { AdminBadgeManager } from '@/components/admin/AdminBadgeManager';
import { MemeBanManager } from '@/components/admin/MemeBanManager';
import { AdminEventsManager } from '@/components/admin/AdminEventsManager';
import { AdminCollabManager } from '@/components/admin/AdminCollabManager';
import { AdminLiveAnalytics } from '@/components/admin/AdminLiveAnalytics';
import { AdminReportsSection } from '@/components/admin/sections/AdminReportsSection';
import { AdminFlagsSection } from '@/components/admin/sections/AdminFlagsSection';
import { AdminAppealsSection } from '@/components/admin/sections/AdminAppealsSection';
import { AdminWarningsSection } from '@/components/admin/sections/AdminWarningsSection';
import { AdminBansSection } from '@/components/admin/sections/AdminBansSection';
import { AdminAnnouncementsSection } from '@/components/admin/sections/AdminAnnouncementsSection';
import { AdminRolesSection } from '@/components/admin/sections/AdminRolesSection';
import { AdminErrorsSection } from '@/components/admin/sections/AdminErrorsSection';
import { AdminSubmissionsSection } from '@/components/admin/sections/AdminSubmissionsSection';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'live', label: 'Live Analytics', icon: Activity },
  { id: 'events', label: 'Events', icon: Calendar },
  { id: 'collabs', label: 'Collabs & Sponsors', icon: Handshake },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'flags', label: 'Content Flags', icon: AlertTriangle },
  { id: 'appeals', label: 'Appeals', icon: MessageSquareWarning },
  { id: 'warnings', label: 'Warnings', icon: AlertTriangle },
  { id: 'bans', label: 'Bans', icon: Ban },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'meme-bans', label: 'Meme Bans', icon: ImageIcon },
  { id: 'submissions', label: 'Submissions', icon: Shield, adminOnly: true },
  { id: 'roles', label: 'User Roles', icon: Users, adminOnly: true },
  { id: 'errors', label: 'Error Monitor', icon: Bug, adminOnly: true },
];

export default function AdminDashboard() {
  const { authReady, user } = useAuth();
  const { data: userRole, isLoading: roleLoading, isFetched: roleFetched } = useUserRole();
  const { data: reports = [] } = useReports();
  const { data: flags = [] } = useContentFlags();
  const { data: warnings = [] } = useAllWarnings();
  const { data: bans = [] } = useAllBans();
  
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('live');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Announcements query
  const { data: announcements = [] } = useQuery({
    queryKey: ['all-announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select(`*, author:profiles!author_id(username, avatar_url)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authReady && !!user,
  });

  // Appeals query
  const { data: appeals = [] } = useQuery({
    queryKey: ['all-appeals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_appeals')
        .select(`*, user:profiles!user_id(id, username, avatar_url, display_name), reviewer:profiles!reviewed_by(username)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authReady && !!user,
  });

  // Bug reports count for badge
  const { data: pendingBugs = 0 } = useQuery({
    queryKey: ['admin-pending-bugs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bug_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count || 0;
    },
    staleTime: 30_000,
    enabled: authReady && !!user && (userRole === 'admin' || userRole === 'owner'),
  });

  // Submissions count for badge (mod apps + creator apps)
  const { data: pendingSubmissions = 0 } = useQuery({
    queryKey: ['admin-pending-submissions-count'],
    queryFn: async () => {
      const [modRes, creatorRes] = await Promise.all([
        supabase.from('moderator_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('creator_profiles').select('id', { count: 'exact', head: true }).not('applied_at', 'is', null).eq('is_approved', false),
      ]);
      return (modRes.count || 0) + (creatorRes.count || 0);
    },
    staleTime: 30_000,
    enabled: authReady && !!user && (userRole === 'admin' || userRole === 'owner'),
  });

  const isAdmin = userRole === 'admin' || userRole === 'owner';
  const isModOrAdmin = isModOrAdminRole(userRole);

  if (isStaffGateLoading(authReady, roleLoading, roleFetched)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isModOrAdmin) {
    return <Navigate to="/home" replace />;
  }

  // Calculate badges for nav items
  const pendingReports = reports.filter(r => r.status === 'pending').length;
  const pendingFlags = flags.filter(f => f.status === 'pending').length;
  const pendingAppeals = appeals.filter((a) => a.status === 'pending').length;

  const getNavBadge = (id: string): number | undefined => {
    switch (id) {
      case 'reports': return pendingReports || undefined;
      case 'flags': return pendingFlags || undefined;
      case 'appeals': return pendingAppeals || undefined;
      case 'errors': return pendingBugs || undefined;
      case 'submissions': return pendingSubmissions || undefined;
      default: return undefined;
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'live':
        return <AdminLiveAnalytics />;
      case 'events':
        return <AdminEventsManager />;
      case 'collabs':
        return <AdminCollabManager />;
      case 'reports':
        return <AdminReportsSection />;
      case 'flags':
        return <AdminFlagsSection />;
      case 'appeals':
        return <AdminAppealsSection />;
      case 'warnings':
        return <AdminWarningsSection />;
      case 'bans':
        return <AdminBansSection />;
      case 'announcements':
        return <AdminAnnouncementsSection />;
      case 'badges':
        return <AdminBadgeManager />;
      case 'meme-bans':
        return <MemeBanManager />;
      case 'submissions':
        return isAdmin ? <AdminSubmissionsSection /> : null;
      case 'roles':
        return isAdmin ? <AdminRolesSection /> : null;
      case 'errors':
        return isAdmin ? <AdminErrorsSection /> : null;
      default:
        return <AdminLiveAnalytics />;
    }
  };


  return (
    <AppLayout hideNav noPadding>
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Back button - mobile/tablet */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 lg:hidden rounded-full bg-background/80 backdrop-blur-sm border border-border/50"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {/* Mobile Sidebar Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed bottom-20 right-4 z-50 md:hidden rounded-full bg-primary text-primary-foreground shadow-lg"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Sidebar */}
        <AnimatePresence>
          {(sidebarOpen || window.innerWidth >= 768) && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                "fixed md:relative z-40 h-full w-64 border-r border-border/50 bg-background/80 backdrop-blur-xl",
                "md:block"
              )}
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b border-border/50" style={{ paddingTop: 'calc(var(--sat, 0px) + 1rem)' }}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h1 className="font-bold text-lg">Admin Panel</h1>
                      <p className="text-xs text-muted-foreground">
                        {isAdmin ? 'Administrator' : 'Moderator'}
                      </p>
                    </div>
                    {isAdmin && (
                      <Badge className="ml-auto bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                        <Crown className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="p-4 border-b border-border/50">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-destructive/10 text-center">
                      <p className="text-lg font-bold text-destructive">{pendingReports + pendingFlags}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-center">
                      <p className="text-lg font-bold text-primary">{bans.length}</p>
                      <p className="text-xs text-muted-foreground">Bans</p>
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <ScrollArea className="flex-1 p-2">
                  <nav className="space-y-1">
                    {navItems.map((item) => {
                      if (item.adminOnly && !isAdmin) return null;
                      
                      const badge = getNavBadge(item.id);
                      const isActive = activeSection === item.id;
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveSection(item.id);
                            if (window.innerWidth < 768) setSidebarOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {badge && badge > 0 && (
                            <Badge 
                              variant={isActive ? "secondary" : "destructive"} 
                              className="h-5 min-w-5 flex items-center justify-center text-xs"
                            >
                              {badge}
                            </Badge>
                          )}
                          <ChevronRight className={cn(
                            "h-4 w-4 transition-transform",
                            isActive && "rotate-90"
                          )} />
                        </button>
                      );
                    })}
                  </nav>
                  {isAdmin && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <Link
                        to="/admin/settings"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                      >
                        <Settings className="h-4 w-4" />
                        Owner Settings
                      </Link>
                    </div>
                  )}
                </ScrollArea>

                {/* Footer */}
                <div className="p-4 border-t border-border/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span>System Online</span>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Backdrop for mobile */}
        {sidebarOpen && window.innerWidth < 768 && (
          <div 
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto p-4 md:p-6 h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
