import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, UserPlus } from 'lucide-react';
import { useFriendRequests, useRespondToFriendRequest } from '@/hooks/useFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { useMutualFriendsWithUser } from '@/components/profile/MutualFriendsDisplay';

// Mini mutual friends display for friend request cards
function MiniMutualFriends({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { data: mutualFriends } = useMutualFriendsWithUser(userId);
  
  const count = mutualFriends?.length || 0;
  if (count === 0) return null;
  
  const displayFriends = mutualFriends?.slice(0, 2) || [];
  
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="flex -space-x-1">
        {displayFriends.map((friend) => (
          <button
            key={friend.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/u/${friend.username}`);
            }}
            className="relative hover:z-10 transition-transform hover:scale-110 rounded-full"
            title={friend.display_name || friend.username}
          >
            <Avatar className="h-4 w-4 border border-background">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-[6px] bg-primary/20">
                {friend.username?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {count} mutual
      </span>
    </div>
  );
}

export function FriendRequestsList() {
  const { t } = useTranslation();
  const { data, isLoading } = useFriendRequests();
  const respondToRequest = useRespondToFriendRequest();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { incoming = [], outgoing = [] } = data || {};

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <UserPlus className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">{t('friends.noRequests')}</h3>
        <p className="text-muted-foreground">{t('friends.noRequestsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Incoming Requests */}
      {incoming.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t('friends.incomingRequests')} ({incoming.length})
          </h3>
          <AnimatePresence>
            {incoming.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <Link to={`/u/${request.sender?.username}`}>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={request.sender?.avatar_url || undefined} />
                    <AvatarFallback>
                      {request.sender?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link to={`/u/${request.sender?.username}`}>
                    <p className="font-medium truncate hover:underline">
                      {request.sender?.display_name || request.sender?.username}
                    </p>
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                  </p>
                  {request.sender?.id && <MiniMutualFriends userId={request.sender.id} />}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respondToRequest.mutate({ requestId: request.id, action: 'accept' })}
                    disabled={respondToRequest.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondToRequest.mutate({ requestId: request.id, action: 'decline' })}
                    disabled={respondToRequest.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Outgoing Requests */}
      {outgoing.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {t('friends.outgoingRequests')} ({outgoing.length})
          </h3>
          <AnimatePresence>
            {outgoing.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <Link to={`/u/${request.receiver?.username}`}>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={request.receiver?.avatar_url || undefined} />
                    <AvatarFallback>
                      {request.receiver?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link to={`/u/${request.receiver?.username}`}>
                    <p className="font-medium truncate hover:underline">
                      {request.receiver?.display_name || request.receiver?.username}
                    </p>
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {t('friends.requestSent')} • {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                  </p>
                  {request.receiver?.id && <MiniMutualFriends userId={request.receiver.id} />}
                </div>

                <span className="text-sm text-muted-foreground">{t('friends.pending')}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
