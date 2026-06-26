import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { 
  Heart, MessageCircle, UserPlus, UserCheck, Check, X, 
  Users, PhoneMissed, Bell, RefreshCw, Sparkles, ShieldAlert, BellRing, Gift
} from 'lucide-react';
import { useNotifications, useMarkNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { useRecentAnnouncements } from '@/hooks/useAnnouncements';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { formatDistanceToNow, differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { preferredUsername } from '@/lib/displayUser';
import { cn } from '@/lib/utils';
import { avatarInitial, parseApiDate, toIsoDateString } from '@/lib/parseApiDate';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateConversation } from '@/hooks/useMessages';
import { useChatPrefetch, useNotificationChatPrefetch } from '@/hooks/useChatPrefetch';
import { MouthZoomProvider, useMouthZoom } from '@/components/notifications/MouthZoomTransition';
import { NotificationTransitionProvider, useNotificationTransition } from '@/components/notifications/NotificationTransitionProvider';
import { useNotificationHoverPrefetch } from '@/hooks/useMouthZoomTransition';
import { SmartPingCard } from '@/components/notifications/SmartPingCard';

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
  smart_ping: { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' },
};

const NOTIFICATION_TEXT: Record<NotificationType, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  friend_request: 'sent you a friend request',
  friend_accepted: 'accepted your friend request',
  friend_declined: 'declined your friend request',
  message: 'sent you a chat',
  mention: 'mentioned you',
  missed_call: 'tried to call you',
  announcement: 'posted an announcement',
  content_removed: 'removed your content',
  smart_ping: '',
};

function compactTime(dateStr: string): string {
  const date = parseApiDate(dateStr);
  if (!date) return '';
  const now = new Date();
  const mins = differenceInMinutes(now, date);
  if (!Number.isFinite(mins) || mins < 1) return 'now';
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

  const actorId = (actor: { id?: string } | null | undefined) => actor?.id || 'unknown';
  const actorSnapshot = (actor: any) => ({
    id: actorId(actor),
    username: preferredUsername(actor),
    avatar_url: actor?.avatar_url ?? null,
    display_name: actor?.display_name ?? null,
  });
  
  for (const n of notifications) {
    if (!n) continue;
    const actor = actorSnapshot(n.actor);

    // Group likes and comments by post_id
    if ((n.type === 'like' || n.type === 'comment') && n.post_id) {
      const key = `${n.type}:${n.post_id}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.actors.find((a) => a.id === actor.id)) {
          existing.actors.push(actor);
        }
        const createdAt = parseApiDate(n.created_at);
        const latestAt = parseApiDate(existing.latest_created_at);
        if (createdAt && (!latestAt || createdAt > latestAt)) {
          existing.latest_created_at = toIsoDateString(n.created_at);
        }
        if (!n.read) existing.read = false;
        existing.notifications.push(n);
      } else {
        groups.set(key, {
          type: n.type,
          post_id: n.post_id,
          actors: [actor],
          latest_created_at: toIsoDateString(n.created_at),
          read: n.read,
          notifications: [n],
        });
      }
    } else if (n.type === 'follow') {
      const key = 'follow';
      const existing = groups.get(key);
      if (existing) {
        if (!existing.actors.find((a) => a.id === actor.id)) {
          existing.actors.push(actor);
        }
        const createdAt = parseApiDate(n.created_at);
        const latestAt = parseApiDate(existing.latest_created_at);
        if (createdAt && (!latestAt || createdAt > latestAt)) {
          existing.latest_created_at = toIsoDateString(n.created_at);
        }
        if (!n.read) existing.read = false;
        existing.notifications.push(n);
      } else {
        groups.set(key, {
          type: 'follow',
          post_id: null,
          actors: [actor],
          latest_created_at: toIsoDateString(n.created_at),
          read: n.read,
          notifications: [n],
        });
      }
    } else {
      ungroupable.push({ ...n, actor, _single: true });
    }
  }
  
  // Merge and sort by latest time
  const result: (GroupedNotification | any)[] = [
    ...Array.from(groups.values()),
    ...ungroupable.map(n => ({ ...n, _single: true })),
  ];
  
  result.sort((a, b) => {
    const aDate = parseApiDate(a.latest_created_at || a.created_at);
    const bDate = parseApiDate(b.latest_created_at || b.created_at);
    return (bDate?.getTime() ?? 0) - (aDate?.getTime() ?? 0);
  });
  
  return result;
}
function RecentAnnouncementsSection() {
  const { data: announcements = [] } = useRecentAnnouncements(5);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (announcements.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">
        Announcements
      </p>
      <div className="rounded-2xl bg-card/95 border border-border/30 overflow-hidden divide-y divide-border/20">
        {announcements.map((a) => (
          <div
            key={a.id}
            className="px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BellRing className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{a.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {compactTime(a.created_at)} · @{a.author?.username}
                </p>
              </div>
            </div>
            <AnimatePresence>
              {expandedId === a.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed mt-2 pl-12">
                    {a.content}
                  </p>
                  {a.image_url && (
                    <img src={a.image_url} alt="" className="mt-2 ml-12 rounded-xl max-h-40 object-cover" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: notifications, isLoading, isError: notificationsError, refetch, isFetching } = useNotifications();
  const { data: friendRequests, isError: requestsError, refetch: refetchRequests } = useFriendRequests();
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
  
  // Priority notifications: DMs, friend requests, mentions — not passive likes/follows
  const priorityTypes = new Set(['friend_request', 'mention', 'reply', 'dm', 'comment']);
  const priorityNotifications = useMemo(() => 
    (notifications || []).filter(n => priorityTypes.has(n.type) || !n.read),
    [notifications]
  );
  
  // Group notifications for better UX
  const groupedUnread = useMemo(() => groupNotifications(unreadNotifications), [unreadNotifications]);
  const groupedRead = useMemo(() => groupNotifications(readNotifications), [readNotifications]);
  const groupedPriority = useMemo(() => groupNotifications(priorityNotifications), [priorityNotifications]);

  const handleAcceptRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'accept' });
  };
  const handleDeclineRequest = (requestId: string) => {
    respondToRequest.mutate({ requestId, action: 'decline' });
  };

  const showNotificationsError =
    notificationsError && !isLoading && !isFetching && !(notifications && notifications.length > 0);

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

        {/* Header with gradient accent */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight gradient-text">Notifications</h1>
              {unreadNotifications.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/20"
                >
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-xs font-semibold text-primary">{unreadNotifications.length} new</span>
                </motion.div>
              )}
            </div>
            <Link
              to="/invite-friends"
              className="relative group flex items-center gap-2 px-4 py-2.5 rounded-xl overflow-hidden bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 text-amber-500 font-semibold text-sm transition-all active:scale-95 hover:shadow-[0_0_15px_hsl(40_95%_60%/0.15)]"
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent" />
              <Gift className="h-4 w-4 relative" />
              <span className="relative">Referrals</span>
            </Link>
          </div>
          {/* Gradient accent line */}
          <div className="mt-3 h-[2px] rounded-full bg-gradient-to-r from-primary/40 via-accent/30 to-transparent" />
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
              value="priority" 
              className="flex-1 h-full rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Priority
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

          {(showNotificationsError || (requestsError && activeTab === 'requests')) && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {showNotificationsError ? "Couldn't load notifications." : "Couldn't load friend requests."}
              </p>
              <Button size="sm" variant="secondary" onClick={handleRefresh}>
                Retry
              </Button>
            </div>
          )}

          {/* ─── ALL TAB ─── */}
          <TabsContent value="all" className="mt-0">
            {/* Recent Announcements */}
            <RecentAnnouncementsSection />

            <AnimatePresence mode="wait">
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

          {/* ─── PRIORITY TAB ─── */}
          <TabsContent value="priority" className="mt-0">
            <AnimatePresence mode="wait">
              {groupedPriority.length > 0 ? (
                <motion.div key="priority" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1">
                    Important
                  </p>
                  <div className="rounded-2xl bg-card/95 border border-border/30 overflow-hidden">
                    {groupedPriority.map((item, idx) => (
                      item._single ? (
                        <NotificationRow
                          key={item.id}
                          notification={item}
                          index={idx}
                          isLast={idx === groupedPriority.length - 1}
                        />
                      ) : (
                        <GroupedNotificationRow
                          key={`${item.type}-${item.post_id || 'follow'}`}
                          group={item as GroupedNotification}
                          index={idx}
                          isLast={idx === groupedPriority.length - 1}
                        />
                      )
                    ))}
                  </div>
                </motion.div>
              ) : (
                <EmptyState
                  icon={<Sparkles className="h-7 w-7 text-muted-foreground" />}
                  title="No priority notifications"
                  description="Mentions, replies, and friend requests will show here"
                />
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ─── REQUESTS TAB ─── */}
          <TabsContent value="requests" className="mt-0">
            <AnimatePresence mode="wait">
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
                      <div
                        className="flex items-center gap-3 p-3 rounded-2xl bg-card/80 backdrop-blur-md border border-border/30 cursor-pointer hover:bg-muted/30 active:scale-[0.99] transition-all"
                        onClick={() => {
                          if (request.sender?.username) {
                            navigate(`/u/${request.sender.username}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && request.sender?.username) {
                            e.preventDefault();
                            navigate(`/u/${request.sender.username}`);
                          }
                        }}
                      >
                        <Link to={`/u/${request.sender?.username}`}>
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={request.sender?.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {avatarInitial(request.sender?.username)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/u/${request.sender?.username}`}>
                            <p className="font-semibold text-sm truncate">
                              @{request.sender?.username}
                            </p>
                            <p className="text-xs text-muted-foreground">Friend request</p>
                          </Link>
                        </div>
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
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
  const firstActor = group.actors[0] ?? { id: 'unknown', username: 'vybeuser', avatar_url: null, display_name: null };
  
  const groupText = actorCount > 1
    ? `${preferredUsername(firstActor)} and ${actorCount - 1} other${actorCount > 2 ? 's' : ''} ${NOTIFICATION_TEXT[group.type]}`
    : `${preferredUsername(firstActor)} ${NOTIFICATION_TEXT[group.type]}`;

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
        <div className="relative shrink-0" style={{ width: actorCount > 1 ? 52 : 48, height: 48 }}>
          <Avatar className="h-11 w-11 absolute top-0 left-0">
            <AvatarImage src={firstActor.avatar_url || undefined} />
            <AvatarFallback className="bg-muted text-foreground text-sm font-semibold">
              {avatarInitial(firstActor.username)}
            </AvatarFallback>
          </Avatar>
          {actorCount > 1 && group.actors[1] && (
            <Avatar className="h-7 w-7 absolute bottom-0 right-0 ring-2 ring-background">
              <AvatarImage src={group.actors[1].avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-foreground text-[10px] font-semibold">
                {avatarInitial(group.actors[1]?.username)}
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
                  <AvatarFallback className="text-[9px]">{avatarInitial(actor.username)}</AvatarFallback>
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
    title?: string | null;
    body?: string | null;
    image_url?: string | null;
    deep_link?: string | null;
    subtype?: string | null;
    meta?: any;
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
  const navigate = useNavigate();
  const actor = notification.actor ?? {
    id: 'unknown',
    username: 'vybeuser',
    avatar_url: null,
    display_name: null,
  };

  const shouldGoToPost = (notification.type === 'like' || notification.type === 'comment') && notification.post_id;
  const shouldGoToChat =
    notification.type === 'message' ||
    notification.type === 'friend_accepted' ||
    notification.type === 'missed_call';

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (notification.type === 'friend_request' && actor.username) {
      navigate(`/u/${actor.username}`);
      return;
    }

    const conversationId =
      (notification.meta as { conversation_id?: string } | null)?.conversation_id ||
      (notification.meta as { conversationId?: string } | null)?.conversationId;

    if (conversationId && (notification.type === 'message' || notification.type === 'missed_call')) {
      navigate(`/messages/${conversationId}`);
      return;
    }

    // Honor explicit deep_link first (daily_brief, announcements, etc.)
    if (notification.deep_link) {
      // Forward the in-app notification title/body so the destination can
      // render exactly what the user saw in the notification.
      const sep = notification.deep_link.includes('?') ? '&' : '?';
      const extra = new URLSearchParams();
      if (notification.title) extra.set('nTitle', notification.title);
      if (notification.body) extra.set('nBody', notification.body);
      extra.set('nid', notification.id);
      navigate(`${notification.deep_link}${sep}${extra.toString()}`);
      return;
    }

    if (shouldGoToPost && notification.post_id) {
      triggerTransition(e, { type: 'post', postId: notification.post_id });
      return;
    }
    if (shouldGoToChat && actor.id) {
      startChatTransition(
        e,
        actor.id,
        actor.username || 'user',
        actor.avatar_url,
        actor.display_name,
      );
      return;
    }
    if (actor.username) {
      triggerTransition(e, {
        type: 'profile',
        userId: actor.id,
        username: actor.username,
        avatarUrl: actor.avatar_url,
        displayName: actor.display_name,
      });
      return;
    }
    // Safe fallback — avoid MouthZoom with missing actor (was "page can't load" on mobile)
    navigate('/home');
  }, [shouldGoToPost, shouldGoToChat, notification, actor, startChatTransition, triggerTransition, navigate]);

  const handleMouseEnter = useCallback(() => {
    if (shouldGoToChat && actor.id) onHover(actor.id);
  }, [shouldGoToChat, actor.id, onHover]);

  // Smart pings get their own rich card UI
  if (notification.type === 'smart_ping') {
    return (
      <div className="px-2 py-1.5">
        <SmartPingCard
          id={notification.id}
          subtype={notification.subtype}
          title={notification.title}
          body={notification.body}
          imageUrl={notification.image_url}
          deepLink={notification.deep_link}
          meta={notification.meta}
          createdAt={notification.created_at}
          read={notification.read}
        />
      </div>
    );
  }

  const config = ICON_CONFIG[notification.type] || ICON_CONFIG.announcement;
  const Icon = config.icon;
  const isChatNotification =
    notification.type === 'message' || notification.type === 'missed_call';
  const chatPreview =
    notification.body?.trim() ||
    (notification.type === 'missed_call' ? 'Missed call' : 'New Chat');

  if (isChatNotification) {
    const displayName = actor.display_name || actor.username || 'Someone';
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03, duration: 0.28 }}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        className={cn(
          'flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none',
          'transition-colors duration-150 active:bg-foreground/[0.06]',
          !isLast && 'border-b border-border/15',
          notification.read && 'opacity-55',
        )}
      >
        <Avatar className="h-12 w-12 flex-shrink-0">
          <AvatarImage src={actor.avatar_url || undefined} className="object-cover" />
          <AvatarFallback className="bg-muted text-foreground font-semibold">
            {avatarInitial(actor.username)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-snug truncate">
            <span className={cn('font-semibold', !notification.read && 'text-foreground')}>
              {displayName}
            </span>{' '}
            <span className="text-muted-foreground font-normal">
              {notification.type === 'missed_call' ? 'called you' : 'sent you a chat'}
            </span>
          </p>
          <p className="text-[13px] text-muted-foreground/80 truncate mt-0.5">{chatPreview}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pl-1">
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-[#0095FF] shadow-[0_0_0_2px_hsl(var(--background))]" />
          )}
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            {compactTime(notification.created_at)}
          </span>
        </div>
      </motion.div>
    );
  }

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
          <AvatarImage src={actor.avatar_url || undefined} />
          <AvatarFallback className="bg-muted text-foreground text-sm font-semibold">
            {avatarInitial(actor.username)}
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
            userId={actor.id}
            username={actor.username}
            displayName={actor.display_name}
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
          {compactTime(notification.created_at)}
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
