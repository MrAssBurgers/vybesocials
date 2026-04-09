import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
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

function compactTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs}h`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d`;
  const weeks = differenceInWeeks(now, date);
  return `${weeks}w`;
}

interface GroupedNotification {
  type: NotificationType;
  post_id: string | null;
  actors: { id: string; username: string; avatar_url: string | null; display_name: string | null }[];
  latest_created_at: string;
  read: boolean;
  notifications: any[];
}

function groupNotifications(notifications: any[]): (GroupedNotification | any)[] {
  const groups: Map<string, GroupedNotification> = new Map();
  const ungroupable: any[] = [];
  
  for (const n of notifications) {
    // Group likes and comments by post_id
    if ((n.type === 'like' || n.type === 'comment') && n.post_id) {
      const key = `${n.type}:${n.post_id}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.actors.find(a => a.id === n.actor.id)) {
          existing.actors.push(n.actor);
        }
        if (new Date(n.created_at) > new Date(existing.latest_created_at)) {
          existing.latest_created_at = n.created_at;
        }
        if (!n.read) existing.read = false;
        existing.notifications.push(n);
      } else {
        groups.set(key, {
          type: n.type,
          post_id: n.post_id,
          actors: [n.actor],
          latest_created_at: n.created_at,
          read: n.read,
          notifications: [n],
        });
      }
    } else if (n.type === 'follow') {
      const key = 'follow';
      const existing = groups.get(key);
      if (existing) {
        if (!existing.actors.find(a => a.id === n.actor.id)) {
          existing.actors.push(n.actor);
        }
        if (new Date(n.created_at) > new Date(existing.latest_created_at)) {
          existing.latest_created_at = n.created_at;
        }
        if (!n.read) existing.read = false;
        existing.notifications.push(n);
      } else {
        groups.set(key, {
          type: 'follow',
          post_id: null,
          actors: [n.actor],
          latest_created_at: n.created_at,
          read: n.read,
          notifications: [n],
        });
      }
    } else {
      ungroupable.push(n);
    }
  }
  
  // Merge and sort by latest time
  const result: (GroupedNotification | any)[] = [
    ...Array.from(groups.values()),
    ...ungroupable.map(n => ({ ...n, _single: true })),
  ];
  
  result.sort((a, b) => {
    const aTime = a.latest_created_at || a.created_at;
    const bTime = b.latest_created_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
  
  return result;
}

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
  
  // Group notifications for better UX
  const groupedUnread = useMemo(() => groupNotifications(unreadNotifications), [unreadNotifications]);
  const groupedRead = useMemo(() => groupNotifications(readNotifications), [readNotifications]);

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
        <div className="mb-6">
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
              to="/invite-friends"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-all active:scale-95"
            >
              <Gift className="h-4 w-4" />
              <span>Referrals</span>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-5 bg-card/90 border border-border/30 p-1 h-11 rounded-xl">
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
              {isLoading && !notifications ? (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <div className="h-11 w-11 rounded-full bg-muted/40 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-3/4 bg-muted/40 rounded animate-pulse" />
                        <div className="h-3 w-1/3 bg-muted/40 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : notifications && notifications.length > 0 ? (
                <motion.div key="notifications" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {/* Unread */}
                  {groupedUnread.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">New</p>
                      <div className="rounded-2xl bg-card/95 border border-primary/10 overflow-hidden">
                        {groupedUnread.map((item, idx) => (
                          item._single ? (
                            <NotificationRow
                              key={item.id}
                              notification={item}
                              index={idx}
                              isLast={idx === groupedUnread.length - 1}
                            />
                          ) : (
                            <GroupedNotificationRow
                              key={`${item.type}-${item.post_id || 'follow'}`}
                              group={item as GroupedNotification}
                              index={idx}
                              isLast={idx === groupedUnread.length - 1}
                            />
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Read */}
                  {groupedRead.length > 0 && (
                    <div className="mt-5">
                      {groupedUnread.length > 0 && (
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">Earlier</p>
                      )}
                      <div className="rounded-2xl bg-card/95 overflow-hidden">
                        {groupedRead.map((item, idx) => (
                          item._single ? (
                            <NotificationRow
                              key={item.id}
                              notification={item}
                              index={idx}
                              isRead
                              isLast={idx === groupedRead.length - 1}
                            />
                          ) : (
                            <GroupedNotificationRow
                              key={`${item.type}-${item.post_id || 'follow'}`}
                              group={item as GroupedNotification}
                              index={idx}
                              isRead
                              isLast={idx === groupedRead.length - 1}
                            />
                          )
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
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -80, transition: { duration: 0.15 } }}
                      transition={{ delay: Math.min(idx * 0.02, 0.1), duration: 0.15 }}
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

// ─── Grouped Notification Row ───
function GroupedNotificationRow({ group, index, isRead, isLast }: { 
  group: GroupedNotification; index: number; isRead?: boolean; isLast?: boolean 
}) {
  const [expanded, setExpanded] = useState(false);
  const config = ICON_CONFIG[group.type] || ICON_CONFIG.announcement;
  const Icon = config.icon;
  const actorCount = group.actors.length;
  const firstActor = group.actors[0];
  
  const groupText = actorCount > 1
    ? `${firstActor.display_name || firstActor.username} and ${actorCount - 1} other${actorCount > 2 ? 's' : ''} ${NOTIFICATION_TEXT[group.type]}`
    : `${firstActor.display_name || firstActor.username} ${NOTIFICATION_TEXT[group.type]}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.035, duration: 0.35 }}
      onClick={() => actorCount > 1 && setExpanded(!expanded)}
      className={cn(
        "px-3 py-3 cursor-pointer select-none transition-colors hover:bg-foreground/[0.04]",
        !isLast && "border-b border-border/20",
        isRead && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Stacked avatars */}
        <div className="relative shrink-0" style={{ width: actorCount > 1 ? 48 : 44, height: 44 }}>
          <Avatar className="h-11 w-11 absolute top-0 left-0">
            <AvatarImage src={firstActor.avatar_url || undefined} />
            <AvatarFallback className="bg-muted text-foreground text-sm font-semibold">
              {firstActor.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {actorCount > 1 && group.actors[1] && (
            <Avatar className="h-7 w-7 absolute bottom-0 right-0 ring-2 ring-background">
              <AvatarImage src={group.actors[1].avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-foreground text-[10px] font-semibold">
                {group.actors[1].username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background",
            config.bg
          )}>
            <Icon className={cn("h-2.5 w-2.5", config.color)} fill={group.type === 'like' ? 'currentColor' : 'none'} />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug text-foreground">{groupText}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{compactTime(group.latest_created_at)}</p>
        </div>

        {!group.read && (
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
        )}
      </div>
      
      {/* Expanded actors list */}
      <AnimatePresence>
        {expanded && actorCount > 1 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2 ml-14 space-y-1"
          >
            {group.actors.slice(0, 8).map(actor => (
              <Link key={actor.id} to={`/u/${actor.username}`} className="flex items-center gap-2 py-1 hover:bg-foreground/[0.03] rounded-lg px-1">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={actor.avatar_url || undefined} />
                  <AvatarFallback className="text-[9px]">{actor.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">@{actor.username}</span>
              </Link>
            ))}
            {actorCount > 8 && (
              <p className="text-[11px] text-muted-foreground/60 px-1">and {actorCount - 8} more</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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
