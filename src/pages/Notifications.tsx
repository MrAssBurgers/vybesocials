import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, UserPlus, UserCheck, Check, X, Users, PhoneMissed } from 'lucide-react';
import { useNotifications, useMarkNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: friendRequests } = useFriendRequests();
  const markRead = useMarkNotificationsRead();
  const respondToRequest = useRespondToFriendRequest();
  const [activeTab, setActiveTab] = useState('all');

  // Mark notifications as read when viewing this page
  useEffect(() => {
    // Small delay to ensure smooth page render first
    const timeout = setTimeout(() => {
      markRead.mutate();
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'like':
        return <Heart className="h-4 w-4 text-primary fill-primary" />;
      case 'comment':
        return <MessageCircle className="h-4 w-4 text-accent" />;
      case 'follow':
        return <UserPlus className="h-4 w-4 text-neon-purple" />;
      case 'friend_request':
        return <Users className="h-4 w-4 text-neon-cyan" />;
      case 'friend_accepted':
        return <UserCheck className="h-4 w-4 text-green-500" />;
      case 'friend_declined':
        return <X className="h-4 w-4 text-destructive" />;
      case 'missed_call':
        return <PhoneMissed className="h-4 w-4 text-destructive" />;
      default:
        return null;
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

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Notifications</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-4 bg-secondary">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 relative">
              Friend Requests
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map((notification, idx) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03, duration: 0.15 }}
                  >
                    <Link
                      to={
                        notification.type === 'friend_request' ||
                        notification.type === 'friend_accepted' ||
                        notification.type === 'friend_declined' ||
                        notification.type === 'follow'
                          ? `/u/${notification.actor.username}`
                          : notification.post_id
                            ? `/p/${notification.post_id}`
                            : `/u/${notification.actor.username}`
                      }
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl transition-colors hover:bg-accent/50",
                        notification.read ? "bg-background" : "bg-secondary"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={notification.actor.avatar_url || undefined} />
                          <AvatarFallback>{notification.actor.username[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-background">
                          {getNotificationIcon(notification.type)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-semibold">{notification.actor.display_name || notification.actor.username}</span>{' '}
                          {getNotificationText(notification.type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">🔔</p>
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground">
                  When someone likes, comments, or follows you, you'll see it here.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests">
            {pendingRequests.length > 0 ? (
              <div className="space-y-3">
                {pendingRequests.map((request, idx) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05, duration: 0.15 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-secondary"
                  >
                    <Link to={`/u/${request.sender?.username}`}>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={request.sender?.avatar_url || undefined} />
                        <AvatarFallback>{request.sender?.username?.[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/u/${request.sender?.username}`} className="hover:underline">
                        <p className="font-semibold truncate">
                          {request.sender?.display_name || request.sender?.username}
                        </p>
                        <p className="text-sm text-muted-foreground">@{request.sender?.username}</p>
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="gradient"
                        onClick={() => handleAcceptRequest(request.id)}
                        disabled={respondToRequest.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeclineRequest(request.id)}
                        disabled={respondToRequest.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">👋</p>
                <p className="text-muted-foreground">No pending friend requests</p>
                <p className="text-sm text-muted-foreground">
                  When someone sends you a friend request, you'll see it here.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
