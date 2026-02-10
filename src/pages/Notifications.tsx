import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, MessageCircle, UserPlus, UserCheck, Check, X, 
  Users, PhoneMissed, Gem, Bell, RefreshCw, Sparkles, ShieldAlert 
} from 'lucide-react';
import { useNotifications, useMarkNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateConversation } from '@/hooks/useMessages';
import { useChatPrefetch, useNotificationChatPrefetch } from '@/hooks/useChatPrefetch';
import { MouthZoomProvider, useMouthZoom } from '@/components/notifications/MouthZoomTransition';
import { NotificationTransitionProvider, useNotificationTransition } from '@/components/notifications/NotificationTransitionProvider';
import { useNotificationHoverPrefetch } from '@/hooks/useMouthZoomTransition';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: notifications, isLoading, refetch } = useNotifications();
  const { data: friendRequests, refetch: refetchRequests } = useFriendRequests();
  const markRead = useMarkNotificationsRead();
  const respondToRequest = useRespondToFriendRequest();
  const createConversation = useCreateConversation();
  const { prefetchConversation } = useChatPrefetch();
  const [activeTab, setActiveTab] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transitionState, setTransitionState] = useState<{
    isAnimating: boolean;
    sourceRect: DOMRect | null;
    actor: { id: string; username: string; avatar_url: string | null; display_name: string | null } | null;
  }>({ isAnimating: false, sourceRect: null, actor: null });

  // Enable notification → chat prefetching
  useNotificationChatPrefetch();

  // Pull to refresh functionality
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetch(),
      refetchRequests(),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 300);
  }, [refetch, refetchRequests, queryClient]);

  const { pullDistance, isRefreshing: isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  // Mark notifications as read when viewing this page
  useEffect(() => {
    const timeout = setTimeout(() => {
      markRead.mutate();
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const getNotificationIcon = (type: NotificationType) => {
    const iconClass = "h-4 w-4";
    switch (type) {
      case 'like':
        return <Heart className={cn(iconClass, "text-primary fill-primary")} />;
      case 'comment':
        return <MessageCircle className={cn(iconClass, "text-accent")} />;
      case 'follow':
        return <UserPlus className={cn(iconClass, "text-primary")} />;
      case 'friend_request':
        return <Users className={cn(iconClass, "text-accent")} />;
      case 'friend_accepted':
        return <UserCheck className={cn(iconClass, "text-primary")} />;
      case 'friend_declined':
        return <X className={cn(iconClass, "text-destructive")} />;
      case 'missed_call':
        return <PhoneMissed className={cn(iconClass, "text-destructive")} />;
      case 'content_removed':
        return <ShieldAlert className={cn(iconClass, "text-destructive")} />;
      default:
        return <Bell className={cn(iconClass, "text-muted-foreground")} />;
    }
  };

  const getNotificationText = (type: NotificationType) => {
    switch (type) {
      case 'like':
        return 'liked your post';
      case 'comment':
        return 'commented on your post';
      case 'follow':
        return 'started following you';
      case 'friend_request':
        return 'sent you a friend request';
      case 'friend_accepted':
        return 'accepted your friend request';
      case 'friend_declined':
        return 'declined your friend request';
      case 'message':
        return 'sent you a message';
      case 'mention':
        return 'mentioned you';
      case 'missed_call':
        return 'tried to call you';
      case 'content_removed':
        return 'removed your content';
      default:
        return '';
    }
  };

  const handleAcceptRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'accept' });
  };

  const handleDeclineRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'decline' });
  };

  const pendingRequests = friendRequests?.incoming || [];

  // Separate unread and read notifications
  const unreadNotifications = notifications?.filter(n => !n.read) || [];
  const readNotifications = notifications?.filter(n => n.read) || [];

  return (
    <NotificationTransitionProvider>
    <MouthZoomProvider>
    <AppLayout>
      <div className="max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24">
        {/* Pull to refresh indicator */}
        <AnimatePresence>
        {pullDistance > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-center mb-4"
            >
              <motion.div
                animate={{ rotate: isPulling ? 360 : pullDistance * 2 }}
                transition={{ duration: isPulling ? 0.5 : 0 }}
              >
                <RefreshCw className={cn(
                  "h-6 w-6 transition-colors",
                  isPulling ? "text-primary" : "text-muted-foreground"
                )} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header with Crystal Share Button */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-5 sm:mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Notifications</h1>
              {notifications && notifications.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unreadNotifications.length} unread
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/invite-friends')}
              className="relative group h-10 w-10 sm:h-11 sm:w-11 rounded-xl"
            >
              <Gem className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-accent rounded-full animate-pulse" />
            </Button>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-4 sm:mb-5 liquid-glass border border-foreground/10 p-1 h-12 sm:h-14 rounded-2xl">
            <TabsTrigger 
              value="all" 
              className="flex-1 h-full rounded-xl text-sm sm:text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              All
            </TabsTrigger>
            <TabsTrigger 
              value="requests" 
              className="flex-1 h-full rounded-xl text-sm sm:text-base font-medium relative data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              Requests
              <AnimatePresence>
                {pendingRequests.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-[10px] text-destructive-foreground font-bold"
                  >
                    {pendingRequests.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            <AnimatePresence mode="popLayout">
              {isLoading || isRefreshing ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <GlassCard key={i} className="p-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </motion.div>
              ) : notifications && notifications.length > 0 ? (
                <motion.div
                  key="notifications"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  {/* Unread section */}
                  {unreadNotifications.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                        New
                      </p>
                      {unreadNotifications.map((notification, idx) => (
                        <NotificationCard
                          key={notification.id}
                          notification={notification}
                          index={idx}
                          getNotificationIcon={getNotificationIcon}
                          getNotificationText={getNotificationText}
                        />
                      ))}
                    </div>
                  )}

                  {/* Read section */}
                  {readNotifications.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {unreadNotifications.length > 0 && (
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                          Earlier
                        </p>
                      )}
                      {readNotifications.map((notification, idx) => (
                        <NotificationCard
                          key={notification.id}
                          notification={notification}
                          index={idx}
                          getNotificationIcon={getNotificationIcon}
                          getNotificationText={getNotificationText}
                          isRead
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <GlassCard className="p-8 sm:p-12 inline-block">
                    <motion.div
                      animate={{ 
                        rotate: [0, -10, 10, -10, 0],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      className="mb-4 inline-block"
                    >
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto">
                        <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                      </div>
                    </motion.div>
                    <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                    <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
                      When someone interacts with you, you'll see it here.
                    </p>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="requests" className="mt-0">
            <AnimatePresence mode="popLayout">
              {pendingRequests.length > 0 ? (
                <motion.div
                  key="requests"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  {pendingRequests.map((request, idx) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ delay: idx * 0.05, duration: 0.2 }}
                    >
                      <GlassCard className="p-4 sm:p-5">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <Link to={`/u/${request.sender?.username}`}>
                            <Avatar className="h-12 w-12 sm:h-14 sm:w-14 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                              <AvatarImage src={request.sender?.avatar_url || undefined} />
                              <AvatarFallback className="text-base sm:text-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
                                {request.sender?.username?.[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link to={`/u/${request.sender?.username}`} className="hover:underline">
                              <p className="font-semibold truncate text-sm sm:text-base">
                                {request.sender?.display_name || request.sender?.username}
                              </p>
                              <p className="text-xs sm:text-sm text-muted-foreground">@{request.sender?.username}</p>
                            </Link>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="icon"
                              className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
                              onClick={() => handleAcceptRequest(request.id)}
                              disabled={respondToRequest.isPending}
                            >
                              <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl"
                              onClick={() => handleDeclineRequest(request.id)}
                              disabled={respondToRequest.isPending}
                            >
                              <X className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty-requests"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <GlassCard className="p-8 sm:p-12 inline-block">
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="mb-4 inline-block"
                    >
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto">
                        <Users className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                      </div>
                    </motion.div>
                    <h3 className="text-lg font-semibold mb-2">No friend requests</h3>
                    <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
                      When someone wants to connect, you'll see their request here.
                    </p>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
    </MouthZoomProvider>
    </NotificationTransitionProvider>
  );
}

// Notification Card Component
interface NotificationCardProps {
  notification: {
    id: string;
    type: NotificationType;
    read: boolean;
    created_at: string;
    post_id: string | null;
    reason?: string | null;
    actor: {
      id: string;
      username: string;
      avatar_url: string | null;
      display_name: string | null;
    };
  };
  index: number;
  getNotificationIcon: (type: NotificationType) => React.ReactNode;
  getNotificationText: (type: NotificationType) => string;
  isRead?: boolean;
}

function NotificationCard({ 
  notification, 
  index, 
  getNotificationIcon, 
  getNotificationText,
  isRead 
}: NotificationCardProps) {
  const { startTransition: startChatTransition } = useMouthZoom();
  const { triggerTransition } = useNotificationTransition();
  const { onHover } = useNotificationHoverPrefetch();
  const navigate = useNavigate();
  
  // Determine where this notification should navigate to
  // - Like/Comment notifications → go to the post
  // - Message notifications → go to chat (with animation)
  // - Friend request/accepted/follow → go to profile
  const shouldGoToPost = (notification.type === 'like' || notification.type === 'comment') && notification.post_id;
  const shouldGoToChat = notification.type === 'message';
  
  // Handle click - route to appropriate destination with smooth transitions
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (shouldGoToPost && notification.post_id) {
      // Animate transition to post
      triggerTransition(e, {
        type: 'post',
        postId: notification.post_id,
      });
    } else if (shouldGoToChat && notification.actor?.id) {
      // Use mouth zoom animation for chat navigation
      startChatTransition(
        e,
        notification.actor.id,
        notification.actor.username,
        notification.actor.avatar_url,
        notification.actor.display_name
      );
    } else {
      // Animate transition to profile
      triggerTransition(e, {
        type: 'profile',
        userId: notification.actor.id,
        username: notification.actor.username,
        avatarUrl: notification.actor.avatar_url,
        displayName: notification.actor.display_name,
      });
    }
  }, [shouldGoToPost, shouldGoToChat, notification, startChatTransition, triggerTransition]);

  // Prefetch on hover for chat notifications
  const handleMouseEnter = useCallback(() => {
    if (shouldGoToChat && notification.actor?.id) {
      onHover(notification.actor.id);
    }
  }, [shouldGoToChat, notification.actor?.id, onHover]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className="cursor-pointer select-none"
    >
      <GlassCard 
        interactive
        className={cn(
          "p-4 sm:p-5 transition-transform duration-150",
          "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          // Prevent outline glitch on hold
          "outline-none touch-manipulation",
          isRead && "opacity-70"
        )}
      >
        <div className="flex items-center gap-3 sm:gap-4 pointer-events-none">
          <div className="relative flex-shrink-0">
            <Avatar className={cn(
              "h-12 w-12 sm:h-14 sm:w-14 transition-all",
              !isRead && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
            )}>
              <AvatarImage src={notification.actor.avatar_url || undefined} />
              <AvatarFallback className="text-base sm:text-lg bg-gradient-to-br from-primary/50 to-accent/50">
                {notification.actor.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "absolute -bottom-1 -right-1 p-1.5 rounded-full",
              isRead ? "bg-muted" : "bg-background shadow-md"
            )}>
              {getNotificationIcon(notification.type)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base leading-snug">
              <StyledUsername
                userId={notification.actor.id}
                username={notification.actor.username}
                displayName={notification.actor.display_name}
                className="font-semibold"
              />{' '}
              <span className={isRead ? "text-muted-foreground" : ""}>
                {getNotificationText(notification.type)}
              </span>
            </p>
            {notification.type === 'content_removed' && notification.reason && (
              <p className="text-xs text-destructive/80 mt-1 bg-destructive/10 rounded-md px-2 py-1">
                Reason: {notification.reason}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </p>
          </div>
          {!notification.read && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0"
            />
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}
