import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, MessageCircle, Video, TrendingUp, RefreshCw, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/firebase';
import { useUserRole } from '@/hooks/useModeration';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

interface MetricCard {
  title: string;
  value: number;
  change?: number;
  icon: React.ReactNode;
}

export default function AdminMetrics() {
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('7d');
  const isAdmin = userRole === 'admin' || userRole === 'owner';
  
  // Redirect if not admin
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/home');
    }
  }, [isAdmin, roleLoading, navigate]);
  
  const getDateFilter = () => {
    if (dateRange === 'all') return null;
    const days = dateRange === '7d' ? 7 : 30;
    return startOfDay(subDays(new Date(), days)).toISOString();
  };
  
  // Fetch analytics data
  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ['admin-metrics', dateRange],
    queryFn: async () => {
      const dateFilter = getDateFilter();
      
      // Get event counts by type
      let query = db
        .from('analytics_events')
        .select('event_name', { count: 'exact' });
      
      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }
      
      const { data: events } = await query;
      
      // Count events by type
      const eventCounts: Record<string, number> = {};
      events?.forEach((e: any) => {
        eventCounts[e.event_name] = (eventCounts[e.event_name] || 0) + 1;
      });
      
      // Get user signups
      let signupQuery = db
        .from('profiles')
        .select('id', { count: 'exact' });
      
      if (dateFilter) {
        signupQuery = signupQuery.gte('created_at', dateFilter);
      }
      
      const { count: signupCount } = await signupQuery;
      
      // Get total posts
      let postsQuery = db
        .from('posts')
        .select('id', { count: 'exact' });
      
      if (dateFilter) {
        postsQuery = postsQuery.gte('created_at', dateFilter);
      }
      
      const { count: postsCount } = await postsQuery;
      
      // Get total messages
      let messagesQuery = db
        .from('messages')
        .select('id', { count: 'exact' });
      
      if (dateFilter) {
        messagesQuery = messagesQuery.gte('created_at', dateFilter);
      }
      
      const { count: messagesCount } = await messagesQuery;
      
      return {
        signups: signupCount || 0,
        posts: postsCount || 0,
        messages: messagesCount || 0,
        events: eventCounts,
        totalEvents: events?.length || 0,
      };
    },
    enabled: isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Fetch recent events for timeline
  const { data: recentEvents } = useQuery({
    queryKey: ['recent-analytics-events'],
    queryFn: async () => {
      const { data } = await db
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      return data || [];
    },
    enabled: isAdmin,
  });
  
  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }
  
  if (!isAdmin) {
    return null;
  }
  
  const metricCards: MetricCard[] = [
    {
      title: 'New Users',
      value: metrics?.signups || 0,
      icon: <Users className="h-5 w-5 text-blue-400" />,
    },
    {
      title: 'Posts Created',
      value: metrics?.posts || 0,
      icon: <Video className="h-5 w-5 text-pink-400" />,
    },
    {
      title: 'Messages Sent',
      value: metrics?.messages || 0,
      icon: <MessageCircle className="h-5 w-5 text-green-400" />,
    },
    {
      title: 'Total Events',
      value: metrics?.totalEvents || 0,
      icon: <TrendingUp className="h-5 w-5 text-purple-400" />,
    },
  ];
  
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl gradient-animated">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
              <p className="text-muted-foreground">Track app metrics and events</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
              <TabsList>
                <TabsTrigger value="7d">7 Days</TabsTrigger>
                <TabsTrigger value="30d">30 Days</TabsTrigger>
                <TabsTrigger value="all">All Time</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
        
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((metric, i) => (
            <motion.div
              key={metric.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="liquid-glass-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {metric.title}
                  </CardTitle>
                  {metric.icon}
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold">
                      {metric.value.toLocaleString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        
        {/* Event Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="liquid-glass-card">
            <CardHeader>
              <CardTitle>Event Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : metrics?.events && Object.keys(metrics.events).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.events)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([event, count]) => (
                      <div key={event} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30">
                        <span className="font-mono text-sm">{event}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No events recorded yet
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
        
        {/* Recent Events Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="liquid-glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentEvents && recentEvents.length > 0 ? (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {recentEvents.map((event: any) => (
                    <div 
                      key={event.id}
                      className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-muted/30 text-sm"
                    >
                      <span className="text-muted-foreground w-32 flex-shrink-0">
                        {format(new Date(event.created_at), 'MMM d, HH:mm')}
                      </span>
                      <span className="font-mono text-primary flex-1">
                        {event.event_name}
                      </span>
                      {event.event_data && Object.keys(event.event_data).length > 0 && (
                        <span className="text-muted-foreground text-xs max-w-48 truncate">
                          {JSON.stringify(event.event_data)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent events
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppLayout>
  );
}
