import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Users, MessageCircle, TrendingUp, Radio, 
  RefreshCw, Eye, Heart, Share2, UserPlus, Clock,
  Image, Bookmark, Star, Video, Phone, Zap
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isStaffQueryEnabled, isAdminRole } from '@/lib/adminAccess';
import { useUserRole } from '@/hooks/useModeration';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, subMinutes, subHours, startOfDay } from 'date-fns';

export function AdminLiveAnalytics() {
  const queryClient = useQueryClient();
  const { user, authReady } = useAuth();
  const profileId = useAuthProfileId();
  const { data: userRole, isFetched: roleFetched } = useUserRole();
  const staffQueriesEnabled = isStaffQueryEnabled(authReady, user, profileId);
  const adminQueriesEnabled = staffQueriesEnabled && roleFetched && isAdminRole(userRole);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [activityTab, setActivityTab] = useState<'all' | 'messages' | 'content' | 'social'>('all');

  // ── Core stats from ALL data sources ──
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['admin-live-stats', refreshKey],
    queryFn: async () => {
      const now = new Date();
      const fiveMinAgo = subMinutes(now, 5).toISOString();
      const tenMinAgo = subMinutes(now, 10).toISOString();
      const oneHourAgo = subHours(now, 1).toISOString();
      const todayStart = startOfDay(now).toISOString();

      const [
        // Active user sources (broader window for heartbeat gaps)
        presenceResult,
        recentSendersResult,
        analyticsActiveResult,
        recentLikersResult,
        recentCommentersResult,
        recentPostersResult,
        recentFollowsResult,
        recentBookmarksResult,
        // Hourly metrics
        messagesHourResult,
        likesHourResult,
        commentsHourResult,
        // Daily metrics
        postsDayResult,
        signupsTodayResult,
        messagesTodayResult,
        likesTodayResult,
        commentsTodayResult,
        followsTodayResult,
        bookmarksTodayResult,
        storiesTodayResult,
        // Live metrics
        callsResult,
        profilesTotalResult,
        authTotalResult,
      ] = await Promise.all([
        // --- Active users (last 10 min to catch between heartbeats) ---
        db.from('chat_presence').select('user_id').gte('last_seen_at', tenMinAgo),
        db.from('messages').select('sender_id').gte('created_at', tenMinAgo).limit(200),
        db.from('analytics_events').select('user_id').gte('created_at', fiveMinAgo).not('user_id', 'is', null).limit(200),
        db.from('likes').select('user_id').gte('created_at', tenMinAgo).limit(100),
        db.from('comments').select('user_id').gte('created_at', tenMinAgo).limit(100),
        db.from('posts').select('author_id').gte('created_at', tenMinAgo).limit(50),
        db.from('follows').select('follower_id').gte('created_at', tenMinAgo).limit(50),
        db.from('bookmarks').select('user_id').gte('created_at', tenMinAgo).limit(50),
        // --- Hourly counts ---
        db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        db.from('likes').select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        db.from('comments').select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo),
        // --- Daily counts ---
        db.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('likes').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('comments').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('follows').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('bookmarks').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('stories').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        // --- Live ---
        db.from('calls').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        db.from('profiles').select('id', { count: 'exact', head: true }),
        adminQueriesEnabled
          ? db.rpc('get_auth_users_count')
          : Promise.resolve({ data: null, error: null }),
      ]);

      // Combine ALL active user IDs from every source
      const activeUserIds = new Set<string>();
      (presenceResult.data || []).forEach((r: any) => r.user_id && activeUserIds.add(r.user_id));
      (recentSendersResult.data || []).forEach((r: any) => r.sender_id && activeUserIds.add(r.sender_id));
      (analyticsActiveResult.data || []).forEach((r: any) => r.user_id && activeUserIds.add(r.user_id));
      (recentLikersResult.data || []).forEach((r: any) => r.user_id && activeUserIds.add(r.user_id));
      (recentCommentersResult.data || []).forEach((r: any) => r.user_id && activeUserIds.add(r.user_id));
      (recentPostersResult.data || []).forEach((r: any) => r.author_id && activeUserIds.add(r.author_id));
      (recentFollowsResult.data || []).forEach((r: any) => r.follower_id && activeUserIds.add(r.follower_id));
      (recentBookmarksResult.data || []).forEach((r: any) => r.user_id && activeUserIds.add(r.user_id));

      return {
        activeNow: activeUserIds.size,
        activeUserIds: Array.from(activeUserIds),
        // Hourly
        messagesHour: messagesHourResult.count || 0,
        likesHour: likesHourResult.count || 0,
        commentsHour: commentsHourResult.count || 0,
        // Daily
        postsDay: postsDayResult.count || 0,
        signupsToday: signupsTodayResult.count || 0,
        messagesToday: messagesTodayResult.count || 0,
        likesToday: likesTodayResult.count || 0,
        commentsToday: commentsTodayResult.count || 0,
        followsToday: followsTodayResult.count || 0,
        bookmarksToday: bookmarksTodayResult.count || 0,
        storiesToday: storiesTodayResult.count || 0,
        // Live
        inCalls: callsResult.count || 0,
        totalUsers:
          adminQueriesEnabled &&
          !authTotalResult.error &&
          typeof authTotalResult.data === 'number'
            ? authTotalResult.data
            : profilesTotalResult.count || 0,
      };
    },
    enabled: adminQueriesEnabled,
    networkMode: 'always',
    refetchInterval: 8000, // Faster polling for live feel
  });

  // ── Real-time activity feed ──
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['admin-recent-activity', refreshKey, activityTab],
    queryFn: async () => {
      const thirtyMinAgo = subMinutes(new Date(), 30).toISOString();
      
      const queries: Array<Promise<any>> = [];
      const shouldFetch = (type: string) => activityTab === 'all' || activityTab === type;
      
      // Messages
      if (shouldFetch('messages')) {
        queries.push(
          Promise.resolve(db.from('messages').select('id, sender_id, created_at, is_deleted')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(15))
            .then(r => (r.data || []).map((m: any) => ({
              id: `msg-${m.id}`, type: 'message', event_name: m.is_deleted ? 'message_unsent' : 'message_sent',
              created_at: m.created_at, user_id: m.sender_id,
            })))
        );
      }
      
      // Content (posts, stories)
      if (shouldFetch('content')) {
        queries.push(
          Promise.resolve(db.from('posts').select('id, author_id, created_at, type, caption')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(10))
            .then(r => (r.data || []).map((p: any) => ({
              id: `post-${p.id}`, type: 'content', event_name: 'post_created',
              created_at: p.created_at, user_id: p.author_id,
              detail: `${p.type || 'post'}: ${p.caption?.substring(0, 40) || 'new post'}`,
            }))),
          Promise.resolve(db.from('stories').select('id, author_id, created_at')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(5))
            .then(r => (r.data || []).map((s: any) => ({
              id: `story-${s.id}`, type: 'content', event_name: 'story_created',
              created_at: s.created_at, user_id: s.user_id,
            }))),
        );
      }
      
      // Social (likes, comments, follows, bookmarks, friend requests)
      if (shouldFetch('social')) {
        queries.push(
          Promise.resolve(db.from('likes').select('id, user_id, created_at')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(10))
            .then(r => (r.data || []).map((l: any) => ({
              id: `like-${l.id}`, type: 'social', event_name: 'post_liked',
              created_at: l.created_at, user_id: l.user_id,
            }))),
          Promise.resolve(db.from('comments').select('id, user_id, created_at, text')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(10))
            .then(r => (r.data || []).map((c: any) => ({
              id: `comment-${c.id}`, type: 'social', event_name: 'comment_added',
              created_at: c.created_at, user_id: c.user_id,
              detail: c.text?.substring(0, 30),
            }))),
          Promise.resolve(db.from('follows').select('id, follower_id, created_at')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(5))
            .then(r => (r.data || []).map((f: any) => ({
              id: `follow-${f.id}`, type: 'social', event_name: 'user_followed',
              created_at: f.created_at, user_id: f.follower_id,
            }))),
          Promise.resolve(db.from('bookmarks').select('id, user_id, created_at')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(5))
            .then(r => (r.data || []).map((b: any) => ({
              id: `bookmark-${b.id}`, type: 'social', event_name: 'post_bookmarked',
              created_at: b.created_at, user_id: b.user_id,
            }))),
          Promise.resolve(db.from('friend_requests').select('id, sender_id, created_at')
            .gte('created_at', thirtyMinAgo).order('created_at', { ascending: false }).limit(5))
            .then(r => (r.data || []).map((fr: any) => ({
              id: `fr-${fr.id}`, type: 'social', event_name: 'friend_request_sent',
              created_at: fr.created_at, user_id: fr.sender_id,
            }))),
        );
      }

      const results = await Promise.all(queries);
      const activities = results.flat();
      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return activities.slice(0, 30);
    },
    enabled: adminQueriesEnabled,
    networkMode: 'always',
    refetchInterval: 5000,
  });

  // ── Online users with profile data ──
  const { data: onlineUsers = [] } = useQuery({
    queryKey: ['admin-online-users', refreshKey, stats?.activeUserIds],
    queryFn: async () => {
      const activeIds = stats?.activeUserIds || [];
      if (activeIds.length === 0) {
        // Fallback: recent heartbeat users
        const { data: recentEvents } = await db
          .from('analytics_events')
          .select('user_id, created_at')
          .eq('event_name', 'heartbeat')
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (!recentEvents?.length) return [];
        const ids = [...new Set(recentEvents.map(e => e.user_id).filter(Boolean))];
        const { data: profiles } = await db
          .from('profiles').select('id, username, avatar_url').in('id', ids);
        
        const timeMap = new Map(recentEvents.map(e => [e.user_id, e.created_at]));
        return (profiles || []).map(p => ({
          ...p, activity: 'recently active',
          last_seen: timeMap.get(p.id) || new Date().toISOString(),
        }));
      }

      const { data: profiles } = await db
        .from('profiles').select('id, username, avatar_url')
        .in('id', activeIds.slice(0, 30));

      return (profiles || []).map(p => ({
        ...p, activity: 'online', last_seen: new Date().toISOString(),
      }));
    },
    enabled: staffQueriesEnabled && !!stats,
    networkMode: 'always',
    refetchInterval: 12000,
  });

  // ── Real-time subscription for instant updates ──
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['admin-live-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-recent-activity'] });
    };

    const channel = subscribePostgresChannel('admin-live-feed', [
      { event: 'INSERT', table: 'messages', callback: invalidate },
      { event: 'INSERT', table: 'posts', callback: invalidate },
      { event: 'INSERT', table: 'likes', callback: invalidate },
      { event: 'INSERT', table: 'follows', callback: invalidate },
    ]);

    return () => { removeRealtimeChannel(channel); };
  }, [queryClient]);

  // Animate live count
  useEffect(() => {
    if (stats?.activeNow !== undefined) setLiveCount(stats.activeNow);
  }, [stats?.activeNow]);

  const getActivityIcon = (eventName: string) => {
    if (eventName.includes('message')) return <MessageCircle className="h-3.5 w-3.5" />;
    if (eventName.includes('like')) return <Heart className="h-3.5 w-3.5" />;
    if (eventName.includes('follow')) return <UserPlus className="h-3.5 w-3.5" />;
    if (eventName.includes('comment')) return <MessageCircle className="h-3.5 w-3.5" />;
    if (eventName.includes('bookmark')) return <Bookmark className="h-3.5 w-3.5" />;
    if (eventName.includes('story')) return <Video className="h-3.5 w-3.5" />;
    if (eventName.includes('post')) return <Image className="h-3.5 w-3.5" />;
    if (eventName.includes('friend')) return <Users className="h-3.5 w-3.5" />;
    return <Activity className="h-3.5 w-3.5" />;
  };

  const getActivityColor = (eventName: string) => {
    if (eventName.includes('message')) return 'text-blue-500 bg-blue-500/10';
    if (eventName.includes('like')) return 'text-pink-500 bg-pink-500/10';
    if (eventName.includes('follow')) return 'text-green-500 bg-green-500/10';
    if (eventName.includes('comment')) return 'text-orange-500 bg-orange-500/10';
    if (eventName.includes('bookmark')) return 'text-yellow-500 bg-yellow-500/10';
    if (eventName.includes('story')) return 'text-purple-500 bg-purple-500/10';
    if (eventName.includes('post')) return 'text-indigo-500 bg-indigo-500/10';
    if (eventName.includes('friend')) return 'text-cyan-500 bg-cyan-500/10';
    return 'text-muted-foreground bg-muted/50';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center relative">
            <Activity className="h-5 w-5 text-white" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Live Analytics</h2>
            <p className="text-xs text-muted-foreground">
              Auto-refreshes every 8s · Realtime subscriptions active
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setRefreshKey(k => k + 1); refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── Primary Live Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <GlassCard className="p-4 relative overflow-hidden border-green-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Radio className="h-5 w-5 text-green-500 animate-pulse" />
                <motion.span
                  key={liveCount}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-green-500"
                >
                  {liveCount}
                </motion.span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Active Now</p>
              <p className="text-[10px] text-muted-foreground/70">Across all activity (10 min window)</p>
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

      {/* ── Daily Overview ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[
          { label: 'Posts Today', value: stats?.postsDay, icon: Image, color: 'text-indigo-500' },
          { label: 'Comments/hr', value: stats?.commentsHour, icon: MessageCircle, color: 'text-orange-500' },
          { label: 'In Calls', value: stats?.inCalls, icon: Phone, color: 'text-red-500' },
          { label: 'Total Users', value: stats?.totalUsers?.toLocaleString(), icon: Users, color: 'text-primary' },
          { label: 'Messages Today', value: stats?.messagesToday, icon: MessageCircle, color: 'text-blue-400' },
          { label: 'Likes Today', value: stats?.likesToday, icon: Heart, color: 'text-pink-400' },
          { label: 'Follows Today', value: stats?.followsToday, icon: UserPlus, color: 'text-green-400' },
          { label: 'Stories Today', value: stats?.storiesToday, icon: Video, color: 'text-purple-400' },
        ].map((item, i) => (
          <GlassCard key={i} className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <p className="text-xl font-bold mt-1">{item.value || 0}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Online Users ── */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Online Now
            </h3>
            <Badge variant="secondary">{onlineUsers.length} users</Badge>
          </div>
          <ScrollArea className="h-[320px]">
            <div className="space-y-1">
              {onlineUsers.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No active users detected</p>
              ) : (
                onlineUsers.map((user: any) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="text-xs">{user.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-500 rounded-full border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">@{user.username}</p>
                      <p className="text-[11px] text-muted-foreground">{user.activity}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {format(new Date(user.last_seen), 'HH:mm')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </GlassCard>

        {/* ── Activity Feed ── */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Live Activity Feed
            </h3>
          </div>
          
          {/* Filter tabs */}
          <Tabs value={activityTab} onValueChange={(v) => setActivityTab(v as any)} className="mb-3">
            <TabsList className="h-8 w-full">
              <TabsTrigger value="all" className="text-xs flex-1">All</TabsTrigger>
              <TabsTrigger value="messages" className="text-xs flex-1">Chat</TabsTrigger>
              <TabsTrigger value="content" className="text-xs flex-1">Content</TabsTrigger>
              <TabsTrigger value="social" className="text-xs flex-1">Social</TabsTrigger>
            </TabsList>
          </Tabs>

          <ScrollArea className="h-[272px]">
            <div className="space-y-0.5">
              {recentActivity.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No recent activity</p>
              ) : (
                <AnimatePresence initial={false}>
                  {recentActivity.map((event: any, i: number) => {
                    const colorClasses = getActivityColor(event.event_name);
                    const [textColor, bgColor] = colorClasses.split(' ');
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.015 }}
                        className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <span className={`p-1.5 rounded-md ${colorClasses}`}>
                          {getActivityIcon(event.event_name)}
                        </span>
                        <span className="flex-1 text-sm truncate">
                          <span className="font-medium">{event.event_name.replace(/_/g, ' ')}</span>
                          {event.detail && <span className="text-muted-foreground ml-1">— {event.detail}</span>}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {format(new Date(event.created_at), 'HH:mm:ss')}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>
        </GlassCard>
      </div>

      {/* ── Platform Health ── */}
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
              value={Math.min(stats?.totalUsers && stats?.activeNow 
                ? (stats.activeNow / stats.totalUsers) * 100 * 10 
                : 0, 100)} 
              className="h-2"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Message Activity</span>
              <span className="font-medium">{stats?.messagesHour || 0}/hr</span>
            </div>
            <Progress value={Math.min((stats?.messagesHour || 0) / 10, 100)} className="h-2" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Content Creation</span>
              <span className="font-medium">{stats?.postsDay || 0}/day</span>
            </div>
            <Progress value={Math.min((stats?.postsDay || 0) / 50, 100)} className="h-2" />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
