import { useFriendshipStatus, useSendFriendRequest, useRespondToFriendRequest } from '@/hooks/useFriends';
import { Button } from '@/components/ui/button';
import { UserPlus, Clock, Check, Users, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

interface DMSafetyGateProps {
  targetUserId: string;
  targetUsername: string;
  children: React.ReactNode;
}

/**
 * Wraps DM input to require friendship before messaging.
 * Public accounts can be messaged by anyone.
 * Private accounts require friendship.
 */
export function DMSafetyGate({ targetUserId, targetUsername, children }: DMSafetyGateProps) {
  const { data: friendship, isLoading: friendshipLoading } = useFriendshipStatus(targetUserId);
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();

  // Check if target user has a public account
  const { data: targetProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile-privacy', targetUserId],
    queryFn: async () => {
      const { data } = await db
        .from('profiles')
        .select('is_private')
        .eq('id', targetUserId)
        .single();
      return data;
    },
    enabled: !!targetUserId,
  });

  const isLoading = friendshipLoading || profileLoading;

  // Show children immediately while loading - optimistic approach for instant input
  // This prevents the input bar from appearing delayed
  if (isLoading) {
    return <>{children}</>;
  }

  // Public accounts can be messaged by anyone
  const isPublicAccount = targetProfile?.is_private === false;
  
  // Friends can always message, or anyone can message public accounts
  if (friendship?.status === 'friends' || isPublicAccount) {
    return <>{children}</>;
  }

  // Pending sent - waiting for response
  if (friendship?.status === 'pending_sent') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border-t border-border"
      >
        <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-muted/50">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Friend request pending. Waiting for <span className="font-medium text-foreground">@{targetUsername}</span> to accept.
          </p>
        </div>
      </motion.div>
    );
  }

  // Pending received - can accept
  if (friendship?.status === 'pending_received' && friendship.requestId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border-t border-border"
      >
        <div className="flex flex-col items-center gap-3 py-4 px-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10">
          <p className="text-sm text-center">
            <span className="font-medium">@{targetUsername}</span> sent you a friend request
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => respondToRequest.mutate({ 
                requestId: friendship.requestId!, 
                action: 'accept' 
              })}
              disabled={respondToRequest.isPending}
              className="gap-2"
            >
              <Check className="h-4 w-4" />
              Accept & Chat
            </Button>
            <Button
              variant="outline"
              onClick={() => respondToRequest.mutate({ 
                requestId: friendship.requestId!, 
                action: 'decline' 
              })}
              disabled={respondToRequest.isPending}
            >
              Decline
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Not friends - show add friend prompt
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 border-t border-border"
    >
      <div className="flex flex-col items-center gap-4 py-6 px-4 rounded-2xl bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium">Become friends to chat</p>
          <p className="text-sm text-muted-foreground">
            Send a friend request to start messaging <span className="font-medium text-foreground">@{targetUsername}</span>
          </p>
        </div>
        <Button
          onClick={() => sendRequest.mutate(targetUserId)}
          disabled={sendRequest.isPending}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          {sendRequest.isPending ? 'Sending...' : 'Add Friend'}
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Badge component to show friendship status in user search results
 */
export function FriendshipStatusBadge({ 
  targetUserId, 
  className 
}: { 
  targetUserId: string; 
  className?: string;
}) {
  const { data: friendship } = useFriendshipStatus(targetUserId);

  if (!friendship || friendship.status === 'none') return null;

  const statusConfig = {
    friends: { label: 'Friends', icon: Check, className: 'bg-emerald-500/10 text-emerald-500' },
    pending_sent: { label: 'Pending', icon: Clock, className: 'bg-amber-500/10 text-amber-500' },
    pending_received: { label: 'Accept', icon: UserPlus, className: 'bg-primary/10 text-primary' },
  };

  const config = statusConfig[friendship.status as keyof typeof statusConfig];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      config.className,
      className
    )}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
