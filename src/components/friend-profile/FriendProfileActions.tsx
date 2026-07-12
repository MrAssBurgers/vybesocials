import { memo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CallButtons } from '@/components/call/CallButtons';
import { FriendButton } from '@/components/friends/FriendButton';
import { useCreateConversation } from '@/hooks/useMessages';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { findExistingDmBetweenProfiles } from '@/lib/dmMembershipRepair';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FriendProfileActionsProps {
  profile: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  friendshipStatus: 'friends' | 'pending_sent' | 'pending_received';
  className?: string;
}

export const FriendProfileActions = memo(function FriendProfileActions({
  profile,
  friendshipStatus,
  className,
}: FriendProfileActionsProps) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const callRef = useRef<HTMLDivElement>(null);
  const myProfileId = useAuthProfileId();

  const { data: conversationId } = useQuery({
    queryKey: ['friend-profile-dm', myProfileId, profile.id],
    queryFn: () => findExistingDmBetweenProfiles(myProfileId!, profile.id),
    enabled: !!myProfileId && friendshipStatus === 'friends',
    staleTime: 60_000,
  });

  const handleMessage = async () => {
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [profile.id] });
      navigate(`/messages/${conversation.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open chat');
    }
  };

  const handleShare = async () => {
    const { buildProfileShareUrl } = await import('@/lib/shareLinks');
    const url = buildProfileShareUrl(profile.username);
    if (navigator.share) {
      await navigator.share({
        title: `${profile.display_name || profile.username} on VYBE`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied!');
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button className="flex-1 min-w-[7rem]" onClick={handleMessage}>
        <MessageCircle className="h-4 w-4 mr-2" />
        Message
      </Button>

      {friendshipStatus === 'friends' && conversationId && (
        <div ref={callRef} className="flex gap-2">
          <CallButtons
            conversationId={conversationId}
            receiverId={profile.id}
            receiverUsername={profile.username}
            receiverDisplayName={profile.display_name || profile.username}
            receiverAvatarUrl={profile.avatar_url}
          />
        </div>
      )}

      {friendshipStatus !== 'friends' && (
        <FriendButton userId={profile.id} className="flex-1" />
      )}

      <Button variant="secondary" size="icon" onClick={handleShare}>
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
});
