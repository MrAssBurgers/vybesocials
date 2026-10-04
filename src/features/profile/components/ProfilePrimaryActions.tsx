import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { createDmChat } from '@/lib/firebase/chats';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { profileFriendshipAction } from '@/lib/profileFriendshipAction';
import { isReportSessionError } from '@/lib/reportModerationService';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';
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
  const actor = useProfileAccount();
  const client = useQueryClient();
  const scope = `${actor.session.uid}:${actor.session.epoch}:${profile.id}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const guard = () => { actor.guard(); if (!mounted.current || currentScope.current !== scope) throw Object.assign(new Error('Open this profile again.'), { code: 'account-changed' }); };
  const showError = (error: unknown, fallback: string) => { try { guard(); } catch { return; } if (!isReportSessionError(error)) toast.error(error instanceof Error ? error.message : fallback); };
  const [friendPending, setFriendPending] = useState(false);
  const friendBusy = useRef(false);
  const changeFriend = async (action: 'send' | 'accept' | 'decline') => {
    if (friendBusy.current) return;
    try {
      guard(); friendBusy.current = true; setFriendPending(true);
      await profileFriendshipAction({ action, targetId: profile.id, expectedOwnerUid: actor.user!.id }, guard); guard();
      await Promise.all([client.invalidateQueries({ queryKey: ['profile-visibility-resolved', profile.id, actor.profile!.id, actor.session.uid, actor.session.epoch] }),
        client.invalidateQueries({ queryKey: ['profile-view-request', profile.id, actor.profile!.id, actor.session.uid, actor.session.epoch] })]);
      guard(); toast.success(action === 'send' ? 'Friend request confirmed' : action === 'accept' ? 'Friend request accepted' : 'Friend request declined');
    } catch (error) { showError(error, 'Friendship could not be updated.'); }
    finally { try { guard(); friendBusy.current = false; setFriendPending(false); } catch { /* Old route. */ } }
  };
  const camera = useCameraOverlayOptional();
  const { state, startCall } = useCallStore();
  const [isStarting, setIsStarting] = useState<CallType | null>(null);
  const startGuardRef = useRef(false);

  const messageBusy = useRef(false);
  const handleMessage = async () => {
    if (messageBusy.current) return;
    try {
      guard(); messageBusy.current = true;
      const id = await createDmChat(profile.id, guard); guard();
      navigate(`/messages/${id}`);
    } catch (error) { showError(error, 'Failed to open chat'); }
    finally { try { guard(); messageBusy.current = false; } catch { /* Old route. */ } }
  };

  const handleShare = async () => {
    const url = buildProfileShareUrl(profile.username);
    try {
      guard();
      if (navigator.share) {
        await navigator.share({
          title: `${profile.display_name || profile.username} on VYBE`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        guard(); toast.success('Profile link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const handleCamera = () => {
    try { guard(); } catch { return; }
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

  const handleStartCall = async (callType: CallType) => {
    if (startGuardRef.current) return;
    try {
      guard();
      if (state.phase !== 'idle') { toast.error('Already in a call'); return; }
      startGuardRef.current = true; setIsStarting(callType);
      const id = await createDmChat(profile.id, guard); guard();
      await startCall({ callType, conversationId: id, receiverId: profile.id, receiverUsername: profile.username,
        receiverDisplayName: profile.display_name || profile.username, receiverAvatarUrl: profile.avatar_url });
      guard();
    } catch (error) { showError(error, 'Failed to start call'); }
    finally { try { guard(); startGuardRef.current = false; setIsStarting(null); } catch { /* Old route. */ } }
  };

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
            disabled={friendPending}
            onClick={() => void changeFriend('send')}
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
              disabled={friendPending}
              onClick={() => void changeFriend('accept')}
            >
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              disabled={friendPending}
              onClick={() => void changeFriend('decline')}
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
