import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserMinus, Clock, Check, X, Loader2 } from 'lucide-react';
import { 
  useFriendshipStatus, 
  useSendFriendRequest, 
  useRespondToFriendRequest,
  useCancelFriendRequest,
  useUnfriend 
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
}

export const FriendButton = memo(function FriendButton({ 
  userId, 
  variant = 'default',
  size = 'default',
  showText = true 
}: FriendButtonProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const { data: friendshipStatus, isLoading } = useFriendshipStatus(userId);
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();
  const cancelRequest = useCancelFriendRequest();
  const unfriend = useUnfriend();

  // CRITICAL: Don't show friend button for own profile
  if (profile?.id === userId) {
    return null;
  }

  // Show auth prompt for guests
  if (isGuest) {
    return (
      <>
        <Button 
          variant={variant} 
          size={size}
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

  if (isLoading) {
    return (
      <Button variant={variant} size={size} disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  const status = friendshipStatus?.status || 'none';
  const requestId = friendshipStatus?.requestId;

  // Already friends
  if (status === 'friends') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size}>
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

  // Request sent, waiting for response
  if (status === 'pending_sent' && requestId) {
    return (
      <Button 
        variant="outline" 
        size={size}
        onClick={() => cancelRequest.mutate(requestId)}
        disabled={cancelRequest.isPending}
      >
        <Clock className="h-4 w-4" />
        {showText && <span className="ml-2">{t('friends.pending')}</span>}
      </Button>
    );
  }

  // Request received, can accept or decline
  if (status === 'pending_received' && requestId) {
    return (
      <div className="flex gap-2">
        <Button 
          variant="default" 
          size={size}
          onClick={() => respondToRequest.mutate({ requestId, action: 'accept' })}
          disabled={respondToRequest.isPending}
        >
          <Check className="h-4 w-4" />
          {showText && <span className="ml-2">{t('friends.accept')}</span>}
        </Button>
        <Button 
          variant="outline" 
          size={size}
          onClick={() => respondToRequest.mutate({ requestId, action: 'decline' })}
          disabled={respondToRequest.isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // No relationship, can send request
  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={() => sendRequest.mutate(userId)}
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
