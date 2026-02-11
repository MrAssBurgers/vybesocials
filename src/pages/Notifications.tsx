import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Heart, MessageCircle, UserPlus, UserCheck, Check, X, 
  Users, PhoneMissed, Bell, RefreshCw, Sparkles, ShieldAlert, BellRing, Gift
} from 'lucide-react';
import { useNotifications, useMarkNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// ─── Icon color mapping ───
const ICON_CONFIG: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  like: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  comment: { icon: MessageCircle, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  follow: { icon: UserPlus, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  friend_request: { icon: Users, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  friend_accepted: { icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  friend_declined: { icon: X, color: 'text-destructive', bg: 'bg-destructive/10' },
  message: { icon: MessageCircle, color: 'text-primary', bg: 'bg-primary/10' },
  mention: { icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  missed_call: { icon: PhoneMissed, color: 'text-destructive', bg: 'bg-destructive/10' },
  announcement: { icon: BellRing, color: 'text-primary', bg: 'bg-primary/10' },
  content_removed: { icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/10' },
};

const NOTIFICATION_TEXT: Record<NotificationType, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  friend_request: 'sent you a friend request',
  friend_accepted: 'accepted your friend request',
  friend_declined: 'declined your friend request',
  message: 'sent you a message',
  mention: 'mentioned you',
  missed_call: 'tried to call you',
  announcement: 'posted an announcement',
  content_removed: 'removed your content',
};

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

  useNotificationChatPrefetch();

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

  useEffect(() => {
    const timeout = setTimeout(() => { markRead.mutate(); }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const pendingRequests = friendRequests?.incoming || [];
  const unreadNotifications = notifications?.filter(n => !n.read) || [];
  const readNotifications = notifications?.filter(n => n.read) || [];

  const handleAcceptRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'accept' });
  };
  const handleDeclineRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'decline' });
  };

  return (
    <NotificationTransitionProvider>
    <MouthZoomProvider>
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-5 pb-24">
        {/* Pull to refresh */}
        <AnimatePresence>
          {pullDistance > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-center mb-4"
            >
              <motion.div animate={{ rotate: isPulling ? 360 : pullDistance * 2 }} transition={{ duration: isPulling ? 0.5 : 0 }}>
                <RefreshCw className={cn("h-5 w-5", isPulling ? "text-primary" : "text-muted-foreground")} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header with referral button */}
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
              {unreadNotifications.length > 0 && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-primary font-medium mt-0.5"
                >
                  {unreadNotifications.length} new
                </motion.p>
              )}
            </div>
            <Link
              to="/referrals"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-all active:scale-95"
            >
              <Gift className="h-4 w-4" />
              <span>Referrals</span>
            </Link>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-5 bg-card/70 backdrop-blur-md border border-border/30 p-1 h-11 rounded-xl">
            <TabsTrigger 
              value="all" 
              className="flex-1 h-full rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              All
            </TabsTrigger>
            <TabsTrigger 
              value="requests" 
              className="flex-1 h-full rounded-lg text-sm font-medium relative data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              Requests
              <AnimatePresence>
                {pendingRequests.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute -top-1.5 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-[10px] text-destructive-foreground font-bold shadow-sm"
                  >
                    {pendingRequests.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </TabsTrigger>
          </TabsList>

          {/* ─── ALL TAB ─── */}
          <TabsContent value="all" className="mt-0">
            <AnimatePresence mode="popLayout">
              {isLoading || isRefreshing ? (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-11 w-11 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : notifications && notifications.length > 0 ? (
                <motion.div key="notifications" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Unread */}
                  {unreadNotifications.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">New</p>
                      <div className="rounded-2xl bg-card/80 backdrop-blur-md border border-primary/10 overflow-hidden">
                        {unreadNotifications.map((notification, idx) => (
                          <NotificationRow
                            key={notification.id}
                            notification={notification}
                            index={idx}
                            isLast={idx === unreadNotifications.length - 1}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Read */}
                  {readNotifications.length > 0 && (
                    <div className="mt-5">
                      {unreadNotifications.length > 0 && (
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">Earlier</p>
                      )}
                      <div className="rounded-2xl bg-card/80 backdrop-blur-md overflow-hidden">
                        {readNotifications.map((notification, idx) => (
                          <NotificationRow
                            key={notification.id}
                            notification={notification}
                            index={idx}
                            isRead
                            isLast={idx === readNotifications.length - 1}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <EmptyState
                  icon={<Bell className="h-7 w-7 text-muted-foreground" />}
                  title="You're all caught up"
                  description="New notifications will appear here"
                />
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ─── REQUESTS TAB ─── */}
          <TabsContent value="requests" className="mt-0">
            <AnimatePresence mode="popLayout">
              {pendingRequests.length > 0 ? (
                <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  {pendingRequests.map((request, idx) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -80, transition: { duration: 0.2 } }}
                      transition={{ delay: idx * 0.04, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-card/80 backdrop-blur-md border border-border/30">
                        <Link to={`/u/${request.sender?.username}`}>
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={request.sender?.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {request.sender?.username?.[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/u/${request.sender?.username}`}>
                            <p className="font-semibold text-sm truncate">
                              {request.sender?.display_name || request.sender?.username}
                            </p>
                            <p className="text-xs text-muted-foreground">@{request.sender?.username}</p>
                          </Link>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
                            onClick={() => handleAcceptRequest(request.id)}
                            disabled={respondToRequest.isPending}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 px-3 rounded-xl text-xs"
                            onClick={() => handleDeclineRequest(request.id)}
                            disabled={respondToRequest.isPending}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <EmptyState
                  icon={<Users className="h-7 w-7 text-muted-foreground" />}
                  title="No requests"
                  description="Friend requests will show up here"
                />
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

// ─── Empty State ───
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div
      key="empty"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-4"
      >
        {icon}
      </motion.div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-[220px]">{description}</p>
    </motion.div>
  );
}

// ─── Notification Row ───
interface NotificationRowProps {
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
  isRead?: boolean;
  isLast?: boolean;
}

function NotificationRow({ notification, index, isRead, isLast }: NotificationRowProps) {
  const { startTransition: startChatTransition } = useMouthZoom();
  const { triggerTransition } = useNotificationTransition();
  const { onHover } = useNotificationHoverPrefetch();

  const config = ICON_CONFIG[notification.type] || ICON_CONFIG.announcement;
  const Icon = config.icon;

  const shouldGoToPost = (notification.type === 'like' || notification.type === 'comment') && notification.post_id;
  const shouldGoToChat = notification.type === 'message';

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (shouldGoToPost && notification.post_id) {
      triggerTransition(e, { type: 'post', postId: notification.post_id });
    } else if (shouldGoToChat && notification.actor?.id) {
      startChatTransition(e, notification.actor.id, notification.actor.username, notification.actor.avatar_url, notification.actor.display_name);
    } else {
      triggerTransition(e, { type: 'profile', userId: notification.actor.id, username: notification.actor.username, avatarUrl: notification.actor.avatar_url, displayName: notification.actor.display_name });
    }
  }, [shouldGoToPost, shouldGoToChat, notification, startChatTransition, triggerTransition]);

  const handleMouseEnter = useCallback(() => {
    if (shouldGoToChat && notification.actor?.id) onHover(notification.actor.id);
  }, [shouldGoToChat, notification.actor?.id, onHover]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ 
        delay: index * 0.035, 
        duration: 0.35, 
        ease: [0.25, 0.1, 0.25, 1]
      }}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 px-3 py-3 cursor-pointer select-none",
        "transition-colors duration-150",
        "hover:bg-foreground/[0.04] active:bg-foreground/[0.07]",
        !isLast && "border-b border-border/20",
        isRead && "opacity-60"
      )}
    >
      {/* Avatar with icon badge */}
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarImage src={notification.actor.avatar_url || undefined} />
          <AvatarFallback className="bg-muted text-foreground text-sm font-semibold">
            {notification.actor.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background",
          config.bg
        )}>
          <Icon className={cn("h-2.5 w-2.5", config.color)} fill={notification.type === 'like' ? 'currentColor' : 'none'} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug">
          <StyledUsername
            userId={notification.actor.id}
            username={notification.actor.username}
            displayName={notification.actor.display_name}
            className="font-semibold"
          />{' '}
          <span className="text-muted-foreground">{NOTIFICATION_TEXT[notification.type] || ''}</span>
        </p>
        {notification.type === 'content_removed' && notification.reason && (
          <p className="text-[11px] text-destructive/80 mt-1 bg-destructive/10 rounded-md px-2 py-0.5 inline-block">
            {notification.reason}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30, delay: index * 0.035 + 0.1 }}
          className="w-2 h-2 rounded-full bg-primary shrink-0"
        />
      )}
    </motion.div>
  );
}
