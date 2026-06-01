import { useState, useEffect, forwardRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, Users, MessageSquare, Bell, Phone, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface DebugStats {
  conversationsLoaded: number;
  onlineUsers: number;
  unreadCount: number;
  activeCallState: string;
  networkStatus: 'online' | 'offline';
  cacheSize: number;
}

export const DebugPanel = memo(forwardRef<HTMLDivElement, object>(function DebugPanel(_props, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<DebugStats>({
    conversationsLoaded: 0,
    onlineUsers: 0,
    unreadCount: 0,
    activeCallState: 'idle',
    networkStatus: navigator.onLine ? 'online' : 'offline',
    cacheSize: 0,
  });

  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const enabled = import.meta.env.DEV && isFeatureEnabled('debug_panel_enabled');

  // Update stats periodically
  useEffect(() => {
    if (!enabled) return;

    const updateStats = () => {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      
      // Get conversation count
      const convQuery = queries.find(q => 
        Array.isArray(q.queryKey) && q.queryKey[0] === 'conversations'
      );
      const conversations = convQuery?.state?.data as any[] | undefined;
      
      // Get unread count
      const unreadQuery = queries.find(q => 
        Array.isArray(q.queryKey) && q.queryKey[0] === 'unread-messages-count'
      );
      const unread = (unreadQuery?.state?.data as number) || 0;

      setStats({
        conversationsLoaded: conversations?.length || 0,
        onlineUsers: 0, // Would need presence subscription
        unreadCount: unread,
        activeCallState: 'idle', // Would need call store
        networkStatus: navigator.onLine ? 'online' : 'offline',
        cacheSize: queries.length,
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 2000);

    const handleOnline = () => setStats(s => ({ ...s, networkStatus: 'online' }));
    const handleOffline = () => setStats(s => ({ ...s, networkStatus: 'offline' }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient, enabled]);

  if (!enabled) return null;

  return (
    <div ref={ref}>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-20 right-4 z-[60] w-10 h-10 rounded-full",
          "bg-primary/90 text-primary-foreground shadow-lg",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform"
        )}
        whileTap={{ scale: 0.9 }}
      >
        <Bug className="w-5 h-5" />
      </motion.button>

      {/* Debug Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "fixed bottom-32 right-4 z-[60]",
              "w-72 p-4 rounded-xl",
              "bg-background/95 backdrop-blur-xl border border-border",
              "shadow-xl"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Debug Panel</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Network Status */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Wifi className={cn(
                    "w-3.5 h-3.5",
                    stats.networkStatus === 'online' ? 'text-green-500' : 'text-red-500'
                  )} />
                  <span>Network</span>
                </div>
                <Badge variant={stats.networkStatus === 'online' ? 'default' : 'destructive'}>
                  {stats.networkStatus}
                </Badge>
              </div>

              {/* User Info */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>User ID</span>
                </div>
                <span className="font-mono text-muted-foreground truncate max-w-[120px]">
                  {profile?.id?.slice(0, 8) || 'N/A'}
                </span>
              </div>

              {/* Conversations */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Conversations</span>
                </div>
                <Badge variant="secondary">{stats.conversationsLoaded}</Badge>
              </div>

              {/* Unread Count */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Unread Messages</span>
                </div>
                <Badge variant={stats.unreadCount > 0 ? 'destructive' : 'secondary'}>
                  {stats.unreadCount}
                </Badge>
              </div>

              {/* Call State */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Call State</span>
                </div>
                <Badge variant="outline">{stats.activeCallState}</Badge>
              </div>

              {/* Cache Size */}
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span>Query Cache</span>
                <span className="text-muted-foreground">{stats.cacheSize} queries</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  queryClient.invalidateQueries();
                }}
              >
                Invalidate All Queries
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}));
