import { useState, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserMinus, Clock, Check, X, Loader2 } from 'lucide-react';
import {
  useFriendshipStatus,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useCancelFriendRequest,
  useUnfriend,
  useFriends,
} from '@/hooks/useFriends';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';

interface FriendButtonProps {
  userId: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showText?: boolean;
  className?: string;
}

export const FriendButton = memo(function FriendButton({
  userId,
  variant = 'default',
  size = 'default',
  showText = true,
  className,
}: FriendButtonProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const { data: friendshipStatus, isLoading, isFetching } = useFriendshipStatus(userId);
  const { data: friends = [] } = useFriends();
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();
  const cancelRequest = useCancelFriendRequest();
  const unfriend = useUnfriend();

  const inFriendsList = useMemo(
    () =>
      friends.some(
        (friend: { id?: string; user_id?: string }) =>
          friend?.id === userId || friend?.user_id === userId,
      ),
    [friends, userId],
  );

  if (profile?.id === userId) {
    return null;
  }

  if (isGuest) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={() => setShowAuthPrompt(true)}
        >
          <UserPlus className="h-4 w-4" />
          {showText && <span className="ml-2">{t('friends.addFriend')}</span>}
        </Button>
        <GuestAuthPrompt
          variant="modal"
          action="add friends"
          open={showAuthPrompt}
          onClose={() => setShowAuthPrompt(false)}
        />
      </>
    );
  }

  if (isLoading && !friendshipStatus && !inFriendsList) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  const status = inFriendsList
    ? 'friends'
    : friendshipStatus?.status || (isFetching && !friendshipStatus ? 'loading' : 'none');
  const requestId = friendshipStatus?.requestId;

  if (status === 'friends') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} className={className}>
            <Check className="h-4 w-4" />
            {showText && <span className="ml-2">{t('friends.friends')}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => unfriend.mutate(userId)}
            className="text-destructive"
          >
            <UserMinus className="h-4 w-4 mr-2" />
            {t('friends.unfriend')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (status === 'loading') {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Pending must never fall through to Add (requestId can be briefly null).
  if (status === 'pending_sent') {
    return (
      <Button
        variant="outline"
        size={size}
        className={className}
        onClick={() => {
          if (requestId) cancelRequest.mutate(requestId);
        }}
        disabled={!requestId || cancelRequest.isPending}
      >
        <Clock className="h-4 w-4" />
        {showText && <span className="ml-2">{t('friends.pending')}</span>}
      </Button>
    );
  }

  if (status === 'pending_received') {
    return (
      <div className="flex gap-2">
        <Button
          variant="default"
          size={size}
          onClick={() => {
            if (requestId) respondToRequest.mutate({ requestId, action: 'accept' });
          }}
          disabled={!requestId || respondToRequest.isPending}
        >
          <Check className="h-4 w-4" />
          {showText && <span className="ml-2">{t('friends.accept')}</span>}
        </Button>
        <Button
          variant="outline"
          size={size}
          onClick={() => {
            if (requestId) respondToRequest.mutate({ requestId, action: 'decline' });
          }}
          disabled={!requestId || respondToRequest.isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        if (inFriendsList || friendshipStatus?.status === 'friends') return;
        sendRequest.mutate(userId);
      }}
      disabled={sendRequest.isPending}
    >
      {sendRequest.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {showText && <span className="ml-2">{t('friends.addFriend')}</span>}
    </Button>
  );
});
