import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, Users, MessageCircle, TrendingUp, Radio, 
  RefreshCw, Eye, Heart, Share2, UserPlus, Clock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Progress } from '@/components/ui/progress';
import { format, subMinutes, subHours } from 'date-fns';

interface LiveUser {
  id: string;
  username: string;
  avatar_url: string | null;
  activity: string;
  last_seen: string;
}

export function AdminLiveAnalytics() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveCount, setLiveCount] = useState(0);

  // Fetch real-time stats
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['admin-live-stats', refreshKey],
    queryFn: async () => {
      const now = new Date();
      const fiveMinAgo = subMinutes(now, 5).toISOString();
      const oneHourAgo = subHours(now, 1).toISOString();
      const oneDayAgo = subHours(now, 24).toISOString();

      // Get active users (last 5 minutes based on any activity)
      const { count: activeNow } = await supabase
        .from('analytics_events')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', fiveMinAgo);

      // Messages in last hour
      const { count: messagesHour } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo);

      // Posts in last 24h
      const { count: postsDay } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      // Likes in last hour
      const { count: likesHour } = await supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo);

      // Comments in last hour
      const { count: commentsHour } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo);

      // New signups today
      const { count: signupsToday } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      // Live activity (people in calls/streams)
      const { count: inCalls } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // Total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      return {
        activeNow: activeNow || 0,
        messagesHour: messagesHour || 0,
        postsDay: postsDay || 0,
        likesHour: likesHour || 0,
        commentsHour: commentsHour || 0,
        signupsToday: signupsToday || 0,
        inCalls: inCalls || 0,
        totalUsers: totalUsers || 0,
      };
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch recent activity feed
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['admin-recent-activity', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch online presence
  const { data: onlineUsers = [] } = useQuery({
    queryKey: ['admin-online-users', refreshKey],
    queryFn: async () => {
      // Get users with recent activity
      const fiveMinAgo = subMinutes(new Date(), 5).toISOString();
      
      const { data: recentEvents } = await supabase
        .from('analytics_events')
        .select('user_id, event_name, created_at')
        .gte('created_at', fiveMinAgo)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!recentEvents || recentEvents.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(recentEvents.map(e => e.user_id).filter(Boolean))];
      
      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds.slice(0, 20));

      // Map to online users with their last activity
      const userActivityMap = new Map<string, { activity: string; last_seen: string }>();
      recentEvents.forEach(e => {
        if (e.user_id && !userActivityMap.has(e.user_id)) {
          userActivityMap.set(e.user_id, {
            activity: e.event_name,
            last_seen: e.created_at,
          });
        }
      });

      return (profiles || []).map(p => ({
        ...p,
        activity: userActivityMap.get(p.id)?.activity || 'browsing',
        last_seen: userActivityMap.get(p.id)?.last_seen || new Date().toISOString(),
      }));
    },
    refetchInterval: 15000,
  });

  // Animate live count
  useEffect(() => {
    if (stats?.activeNow !== undefined) {
      setLiveCount(stats.activeNow);
    }
  }, [stats?.activeNow]);

  const getActivityIcon = (eventName: string) => {
    if (eventName.includes('message')) return <MessageCircle className="h-3 w-3" />;
    if (eventName.includes('like')) return <Heart className="h-3 w-3" />;
    if (eventName.includes('follow')) return <UserPlus className="h-3 w-3" />;
    if (eventName.includes('share')) return <Share2 className="h-3 w-3" />;
    if (eventName.includes('view')) return <Eye className="h-3 w-3" />;
    return <Activity className="h-3 w-3" />;
  };

  const getActivityColor = (eventName: string) => {
    if (eventName.includes('message')) return 'text-blue-500';
    if (eventName.includes('like')) return 'text-pink-500';
    if (eventName.includes('follow')) return 'text-green-500';
    if (eventName.includes('share')) return 'text-purple-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center relative">
            <Activity className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full animate-ping" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Live Analytics</h2>
            <p className="text-sm text-muted-foreground">Real-time platform activity</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setRefreshKey(k => k + 1); refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Live Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <GlassCard className="p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-green-500 animate-pulse" />
                <motion.span
                  key={liveCount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-green-500"
                >
                  {liveCount}
                </motion.span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Active Now</p>
            </div>
          </GlassCard>
        </motion.div>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold">{stats?.messagesHour || 0}</span>
          </div>
          <p className="text-sm text-muted-foreground">Messages/hr</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            <span className="text-2xl font-bold">{stats?.likesHour || 0}</span>
          </div>
          <p className="text-sm text-muted-foreground">Likes/hr</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-purple-500" />
            <span className="text-2xl font-bold">{stats?.signupsToday || 0}</span>
          </div>
          <p className="text-sm text-muted-foreground">New Today</p>
        </GlassCard>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Posts Today</span>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-xl font-bold mt-1">{stats?.postsDay || 0}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Comments/hr</span>
            <MessageCircle className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-xl font-bold mt-1">{stats?.commentsHour || 0}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">In Calls</span>
            <Radio className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-xl font-bold mt-1">{stats?.inCalls || 0}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Users</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold mt-1">{stats?.totalUsers?.toLocaleString() || 0}</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Online Users */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Online Now
            </h3>
            <Badge variant="secondary">{onlineUsers.length} users</Badge>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {onlineUsers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No active users</p>
              ) : (
                onlineUsers.map((user: any) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">@{user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.activity}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(user.last_seen), 'HH:mm')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </GlassCard>

        {/* Activity Feed */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Live Activity Feed
            </h3>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {recentActivity.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No recent activity</p>
              ) : (
                recentActivity.map((event: any, i: number) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30"
                  >
                    <span className={getActivityColor(event.event_name)}>
                      {getActivityIcon(event.event_name)}
                    </span>
                    <span className="flex-1 text-sm font-mono truncate">
                      {event.event_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.created_at), 'HH:mm:ss')}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </GlassCard>
      </div>

      {/* Platform Health */}
      <GlassCard className="p-4">
        <h3 className="font-semibold mb-4">Platform Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">User Engagement</span>
              <span className="font-medium">
                {stats?.totalUsers && stats?.activeNow 
                  ? ((stats.activeNow / stats.totalUsers) * 100).toFixed(1) 
                  : 0}%
              </span>
            </div>
            <Progress 
              value={stats?.totalUsers && stats?.activeNow 
                ? (stats.activeNow / stats.totalUsers) * 100 * 10 
                : 0} 
              className="h-2"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Message Activity</span>
              <span className="font-medium">{stats?.messagesHour || 0}/hr</span>
            </div>
            <Progress 
              value={Math.min((stats?.messagesHour || 0) / 10, 100)} 
              className="h-2"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Content Creation</span>
              <span className="font-medium">{stats?.postsDay || 0}/day</span>
            </div>
            <Progress 
              value={Math.min((stats?.postsDay || 0) / 50, 100)} 
              className="h-2"
            />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
