import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Check,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Settings,
  Share2,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateConversation } from '@/hooks/useMessages';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useSendFriendRequest, useRespondToFriendRequest, useFriendshipStatus } from '@/hooks/useFriends';
import { findExistingDmBetweenProfiles } from '@/lib/dmMembershipRepair';
import { openSnapCamera, useCameraOverlayOptional } from '@/contexts/CameraOverlayContext';
import { useCallStore, type CallType } from '@/lib/callStore';
import { buildProfileShareUrl } from '@/lib/shareLinks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProfileActionId, ProfileViewMode, ProfileViewProfile } from '../types';

interface ProfilePrimaryActionsProps {
  profile: ProfileViewProfile;
  mode: ProfileViewMode;
  primaryAction: ProfileActionId | null;
  secondaryActions: ProfileActionId[];
  onMore?: () => void;
  className?: string;
}

function RailButton({
  label,
  onClick,
  disabled,
  variant = 'default',
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'camera';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-w-[3.5rem] flex-col items-center gap-1.5"
    >
      {variant === 'camera' ? (
        <span className="vybe-profile-action-circle vybe-profile-action-circle--camera">
          <span>{children}</span>
        </span>
      ) : (
        <span className="vybe-profile-action-circle">{children}</span>
      )}
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

export function ProfilePrimaryActions({
  profile,
  mode,
  primaryAction,
  secondaryActions,
  onMore,
  className,
}: ProfilePrimaryActionsProps) {
  const navigate = useNavigate();
  const myProfileId = useAuthProfileId();
  const createConversation = useCreateConversation();
  const sendFriend = useSendFriendRequest();
  const respondFriend = useRespondToFriendRequest();
  const friendship = useFriendshipStatus(profile.id);
  const camera = useCameraOverlayOptional();
  const { state, startCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);
  const startGuardRef = useRef(false);

  const { data: conversationId } = useQuery({
    queryKey: ['profile-view-dm', myProfileId, profile.id],
    queryFn: () => findExistingDmBetweenProfiles(myProfileId!, profile.id),
    enabled: !!myProfileId && mode === 'friend',
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
    const url = buildProfileShareUrl(profile.username);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profile.display_name || profile.username} on VYBE`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const handleCamera = () => {
    if (!camera?.openCamera) {
      navigate('/upload');
      return;
    }
    openSnapCamera(camera.openCamera, {
      source: 'profile',
      profileId: profile.id,
      recipientIds: [profile.id],
      defaultDestination: 'direct',
      returnRoute: `/u/${encodeURIComponent(profile.username)}`,
    });
  };

  const ensureConversationThen = useCallback(
    async (then: (id: string) => void | Promise<void>) => {
      try {
        let id = conversationId;
        if (!id) {
          const conversation = await createConversation.mutateAsync({ memberIds: [profile.id] });
          id = conversation.id;
        }
        if (id) await then(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not open chat');
      }
    },
    [conversationId, createConversation, profile.id],
  );

  const handleStartCall = useCallback(
    async (callType: CallType) => {
      if (startGuardRef.current) return;
      if (state.phase !== 'idle') {
        toast.error('Already in a call');
        return;
      }
      startGuardRef.current = true;
      setIsStarting(callType);
      try {
        await ensureConversationThen(async (id) => {
          await startCall({
            callType,
            conversationId: id,
            receiverId: profile.id,
            receiverUsername: profile.username,
            receiverDisplayName: profile.display_name || profile.username,
            receiverAvatarUrl: profile.avatar_url,
          });
        });
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to start call');
      } finally {
        startGuardRef.current = false;
        setIsStarting(null);
      }
    },
    [ensureConversationThen, profile, startCall, state.phase],
  );

  if (mode === 'blocked' || !primaryAction) return null;

  if (mode === 'friend') {
    return (
      <div className={cn('vybe-profile-chrome flex items-start justify-around px-2 py-0.5', className)}>
        <RailButton label="Camera" variant="camera" onClick={handleCamera}>
          <Camera className="h-5 w-5" />
        </RailButton>
        <RailButton label="Chat" onClick={() => void handleMessage()}>
          <MessageCircle className="h-5 w-5" />
        </RailButton>
        <RailButton
          label="Call"
          disabled={isStarting !== null || state.phase !== 'idle'}
          onClick={() => void handleStartCall('audio')}
        >
          {isStarting === 'audio' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Phone className="h-5 w-5" />
          )}
        </RailButton>
        <RailButton
          label="Video"
          disabled={isStarting !== null || state.phase !== 'idle'}
          onClick={() => void handleStartCall('video')}
        >
          {isStarting === 'video' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </RailButton>
        <RailButton label="More" onClick={() => onMore?.()}>
          <MoreHorizontal className="h-5 w-5" />
        </RailButton>
      </div>
    );
  }

  if (mode === 'self') {
    return (
      <div className={cn('vybe-profile-chrome flex items-center gap-2 px-4', className)}>
        <Button className="h-9 flex-1 rounded-lg text-sm" onClick={() => navigate('/settings')}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit Profile
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg"
          onClick={() => void handleShare()}
          aria-label="Share profile"
        >
          <Share2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('vybe-profile-chrome space-y-3 px-4', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {primaryAction === 'add_friend' && (
          <Button
            className="min-w-[10rem] rounded-full"
            disabled={sendFriend.isPending}
            onClick={() => sendFriend.mutate(profile.id)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Friend
          </Button>
        )}
        {primaryAction === 'request_sent' && (
          <Button className="min-w-[10rem] rounded-full" variant="secondary" disabled>
            Request Sent
          </Button>
        )}
        {primaryAction === 'accept' && (
          <>
            <Button
              className="min-w-[7rem] rounded-full"
              disabled={respondFriend.isPending}
              onClick={() => {
                const requestId = friendship.data?.requestId;
                if (!requestId) {
                  toast.error('Request not found');
                  return;
                }
                respondFriend.mutate({ requestId, action: 'accept' });
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              disabled={respondFriend.isPending}
              onClick={() => {
                const requestId = friendship.data?.requestId;
                if (!requestId) return;
                respondFriend.mutate({ requestId, action: 'decline' });
              }}
              aria-label="Decline"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <div className="flex items-start justify-center gap-8">
        {secondaryActions.includes('share_profile') && (
          <RailButton label="Share" onClick={() => void handleShare()}>
            <Share2 className="h-5 w-5" />
          </RailButton>
        )}
        <RailButton label="More" onClick={() => onMore?.()}>
          <MoreHorizontal className="h-5 w-5" />
        </RailButton>
      </div>
    </div>
  );
}
