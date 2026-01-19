import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, UserPlus, UserCheck, Check, X, Users, PhoneMissed, Gem, Share2, Copy } from 'lucide-react';
import { useNotifications, useMarkNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { useMyInvite, getInviteUrl } from '@/hooks/useInvites';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: friendRequests } = useFriendRequests();
  const { data: myInvite } = useMyInvite();
  const markRead = useMarkNotificationsRead();
  const respondToRequest = useRespondToFriendRequest();
  const [activeTab, setActiveTab] = useState('all');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteUrl = myInvite ? getInviteUrl(myInvite.invite_code) : '';
  const qrCodeUrl = inviteUrl 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}&bgcolor=1a1a1a&color=ffffff`
    : '';

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleShareInvite = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on VYBE',
          text: 'Check out VYBE - the social app for creators!',
          url: inviteUrl,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleCopyInvite();
        }
      }
    } else {
      handleCopyInvite();
    }
  };
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
        {/* Header with Crystal Share Button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Notifications</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowShareDialog(true)}
            className="relative group"
          >
            <Gem className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-accent rounded-full animate-pulse" />
          </Button>
        </div>

        {/* Share Invite Dialog */}
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gem className="h-5 w-5 text-primary" />
                Invite Friends to VYBE
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground text-center">
                Share your link and get rewards when friends join! They'll automatically become your friend.
              </p>
              
              {/* QR Code */}
              {qrCodeUrl && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-center"
                >
                  <div className="p-4 bg-white rounded-xl shadow-lg">
                    <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" />
                  </div>
                </motion.div>
              )}
              
              {/* Invite Link */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                <div className="flex-1 font-mono text-sm truncate text-muted-foreground">
                  {inviteUrl || 'Loading...'}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleCopyInvite}
                  disabled={!inviteUrl}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              {/* Share Button */}
              <Button 
                className="w-full gradient-animated"
                onClick={handleShareInvite}
                disabled={!inviteUrl}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Invite Link
              </Button>
              
              {/* Rewards hint */}
              <p className="text-xs text-center text-muted-foreground">
                ✨ Earn badges & unlock themes by inviting friends!
              </p>
            </div>
          </DialogContent>
        </Dialog>
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
