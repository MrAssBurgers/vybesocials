import { memo, useCallback } from 'react';
import { Camera, Pin, Users, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { dmInboxPreviewStatus } from '@/lib/dmInboxPreviewStatus';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { safeDmMembers } from '@/lib/persistedCollections';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { activityPreviewLabel } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import {
  openCameraFromGesture,
  useCameraOverlay,
} from '@/contexts/CameraOverlayContext';
import { insertDmMessage } from '@/lib/dmSendCore';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { cn } from '@/lib/utils';
import type { DMConversationPreview } from './dm.types';

export interface DMConversationRowProps {
  conversation: LoadedDMConversation;
  preview?: DMConversationPreview;
  profileId?: string;
  authUid?: string;
  isActive?: boolean;
  priority?: boolean;
  isTyping?: boolean;
  presenceActivity?: ActivityType;
  isSwiping?: boolean;
}

export const DMConversationRow = memo(function DMConversationRow({
  conversation,
  preview,
  profileId,
  authUid,
  isActive,
  priority = false,
  isTyping = false,
  presenceActivity,
  isSwiping = false,
}: DMConversationRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openCamera } = useCameraOverlay();
  const resolved = conversation.is_group
    ? null
    : resolveOtherMemberFromConversation(conversation, profileId, authUid);
  const other = resolved?.profile;
  const otherProfileId =
    preview?.otherProfileId || (other?.id ? String(other.id) : resolved?.user_id);
  const displayName =
    preview?.displayName ||
    displayNameForConversation(conversation, profileId, authUid, 'Chat');
  const avatarUrl =
    preview?.avatarUrl ||
    (conversation.is_group
      ? conversation.avatar_url || undefined
      : resolveProfileAvatarUrl(
          otherProfileId,
          other?.avatar_url as string | null | undefined,
        ) || undefined);
  const membership = safeDmMembers(conversation.members).find(
    (member) => member.user_id === profileId,
  );
  const unreadCount = preview?.unreadCount ?? conversation.unread_count ?? 0;
  const unread =
    preview?.isUnread ?? (unreadCount > 0 || conversation._hasUnread);
  const pinned = preview?.isPinned ?? Boolean(membership?.is_pinned);
  const muted = preview?.isMuted ?? Boolean(membership?.is_muted);
  const typing = preview?.isTyping ?? isTyping;
  const activity = preview?.presenceActivity ?? presenceActivity;
  const username =
    preview?.username || (typeof other?.username === 'string' ? other.username : undefined);
  const statusLine =
    preview?.statusLine || dmInboxPreviewStatus(conversation, profileId, authUid);
  const messagePreview =
    preview?.previewText ||
    dmConversationPreviewText({
      lastMessage: conversation.last_message,
      isGroup: conversation.is_group,
      profileId,
      authUid,
      otherProfileId,
      previewMaxLen: 48,
    });
  const secondaryLine =
    statusLine && messagePreview && statusLine !== messagePreview
      ? `${statusLine} · ${messagePreview}`
      : statusLine || messagePreview;

  const stopRowGesture = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openProfile = (event: React.SyntheticEvent) => {
    stopRowGesture(event);
    if (username) openFriendProfile(navigate, { username, friendshipStatus: 'friends' });
  };

  const openSnapCamera = useCallback(
    (event: React.SyntheticEvent) => {
      stopRowGesture(event);
      if (!profileId) {
        toast.error('Sign in to send a snap');
        return;
      }
      openCameraFromGesture(openCamera, 'dm', {
        onSend: async (mediaUrl, isVideo) => {
          const result = await insertDmMessage(
            {
              conversation_id: conversation.id,
              sender_id: profileId,
              content: null,
              media_url: mediaUrl,
              media_type: 'vybe',
              message_type: 'text',
              view_mode: 'view_once',
              expires_at: null,
              reply_to_id: null,
            },
            {
              otherProfileId,
              push: {
                senderName: 'VYBE',
                preview: isVideo ? '🎬 New Snap' : '📸 New Snap',
                isGroup: conversation.is_group,
                groupName: conversation.name || undefined,
              },
            },
          );
          if (result.error) {
            toast.error(result.error.message);
            return;
          }
          invalidateConversationCaches(queryClient);
          toast.success('Snap sent');
        },
      });
    },
    [
      conversation.id,
      conversation.is_group,
      conversation.name,
      openCamera,
      otherProfileId,
      profileId,
      queryClient,
    ],
  );

  return (
    <div
      className={cn(
        'dm-inbox-card',
        isActive && 'dm-inbox-card--active',
        unread && 'dm-inbox-card--unread',
        pinned && 'dm-inbox-card--pinned',
        isSwiping && 'dm-inbox-card--swiping',
      )}
    >
      <button
        type="button"
        className="dm-inbox-avatar-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openProfile}
        aria-label={username ? `Open ${displayName}'s profile` : displayName}
        disabled={!username}
      >
        <span className="dm-inbox-avatar-ring" aria-hidden />
        <Avatar className="dm-inbox-avatar">
          {conversation.is_group && !avatarUrl ? (
            <AvatarFallback className="bg-muted text-muted-foreground">
              <Users className="h-6 w-6" />
            </AvatarFallback>
          ) : (
            <>
              <ProfileAvatarImage
                profileId={otherProfileId}
                src={avatarUrl}
                transformSize={160}
                priority={priority}
              />
              <AvatarFallback className="bg-muted text-lg font-semibold">
                {displayName[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </>
          )}
        </Avatar>
        {activity && activity !== 'idle' && (
          <span className="dm-inbox-presence-dot" aria-label="Online" />
        )}
      </button>

      <div className="dm-inbox-row-copy">
        <div className="dm-inbox-name-line">
          <button
            type="button"
            className={cn('dm-inbox-name', unread && 'dm-inbox-name--unread')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openProfile}
            disabled={!username}
          >
            {displayName}
          </button>
          {pinned && <Pin className="dm-inbox-meta-icon" aria-label="Pinned" />}
          {muted && <VolumeX className="dm-inbox-meta-icon" aria-label="Muted" />}
        </div>
        {typing ? (
          <div className="dm-inbox-status dm-inbox-preview--typing">
            <TypingIndicator size="sm" />
            <span>typing…</span>
          </div>
        ) : activity && activity !== 'idle' ? (
          <p className="dm-inbox-status dm-inbox-preview--live">
            {activityPreviewLabel(activity)}
          </p>
        ) : (
          <p className={cn('dm-inbox-status', unread && 'dm-inbox-preview--unread')}>
            {secondaryLine}
          </p>
        )}
      </div>

      {unreadCount > 0 && (
        <span className="dm-inbox-unread-badge" aria-label={`${unreadCount} unread`}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      <button
        type="button"
        className="dm-inbox-camera-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openSnapCamera}
        aria-label={`Send a snap to ${displayName}`}
      >
        <Camera />
      </button>
    </div>
  );
});
