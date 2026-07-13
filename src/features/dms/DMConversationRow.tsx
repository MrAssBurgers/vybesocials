import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  Heart,
  Moon,
  Pin,
  Sparkles,
  Users,
  VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { resolveDmInboxStatus } from '@/lib/dmInboxStatus';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { safeDmMembers } from '@/lib/persistedCollections';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { activityPreviewLabel } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import {
  openCameraFromGesture,
  useCameraOverlayOptional,
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
  const cameraOverlay = useCameraOverlayOptional();
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
  const status = resolveDmInboxStatus(
    conversation,
    profileId,
    authUid,
    preview?.streakCount,
  );
  const statusLine = preview?.statusLine || status.line;
  const StatusIcon = status.Icon;
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
  const showSeparatePreview = Boolean(
    messagePreview &&
      messagePreview !== statusLine &&
      !messagePreview.startsWith(status.label),
  );
  const storyState = preview?.storyState || 'none';
  const isOnline = preview?.isOnline ?? Boolean(activity && activity !== 'idle');
  const isAway = preview?.isAway ?? false;
  const secondaryAvatarUrl = preview?.secondaryAvatarUrl;
  const isVerified = preview?.isVerified;
  const relationshipBadge = preview?.relationshipBadge;
  const quickReaction = preview?.quickReaction;
  const streakCount = preview?.streakCount;
  const trailTime = status.age;

  // Controlled VFX: one-shot highlight sweep the moment a row flips from read → unread.
  const [sweeping, setSweeping] = useState(false);
  const wasUnreadRef = useRef(unread);
  useEffect(() => {
    if (unread && !wasUnreadRef.current) {
      setSweeping(true);
      const timer = setTimeout(() => setSweeping(false), 900);
      wasUnreadRef.current = unread;
      return () => clearTimeout(timer);
    }
    wasUnreadRef.current = unread;
  }, [unread]);

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
      if (!cameraOverlay) {
        navigate(`/messages/${conversation.id}?camera=1`);
        return;
      }
      openCameraFromGesture(cameraOverlay.openCamera, 'dm', {
        onSend: async (mediaUrl, isVideo) => {
          const result = await insertDmMessage(
            {
              conversation_id: conversation.id,
              sender_id: profileId,
              content: null,
              media_url: mediaUrl,
              media_type: 'vybe',
              message_type: 'vybe',
              view_mode: 'view_once',
              expires_at: null,
              reply_to_id: null,
              client_message_id: `snap_${conversation.id}_${Date.now()}`,
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
      cameraOverlay,
      navigate,
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
      {sweeping && <div className="dm-inbox-sweep dm-inbox-sweep--play" aria-hidden />}
      <button
        type="button"
        className={cn(
          'dm-inbox-avatar-button dm-vfx-press',
          storyState === 'unviewed' && 'dm-inbox-avatar-button--story',
          storyState === 'viewed' && 'dm-inbox-avatar-button--story-viewed',
        )}
        onPointerDown={(event) => {
          // Only steal the gesture when profile navigation can succeed.
          if (username) event.stopPropagation();
        }}
        onClick={openProfile}
        aria-label={username ? `Open ${displayName}'s profile` : displayName}
        disabled={!username}
      >
        <span
          className={cn(
            'dm-inbox-avatar-ring',
            storyState === 'unviewed' && 'dm-inbox-avatar-ring--story dm-vfx-story-pulse',
          )}
          aria-hidden
        />
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
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {displayName[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </>
          )}
        </Avatar>
        {secondaryAvatarUrl && (
          <Avatar className="dm-inbox-avatar-secondary" aria-hidden>
            <ProfileAvatarImage src={secondaryAvatarUrl} transformSize={64} />
            <AvatarFallback className="bg-muted text-[10px] font-semibold">+</AvatarFallback>
          </Avatar>
        )}
        {isAway ? (
          <span className="dm-inbox-away-badge" aria-label="Away">
            <Moon />
          </span>
        ) : isOnline ? (
          <span className="dm-inbox-presence-dot" aria-label="Online" />
        ) : null}
      </button>

      <div className="dm-inbox-row-copy">
        <div className="dm-inbox-name-line">
          <p className={cn('dm-inbox-name', unread && 'dm-inbox-name--unread')}>{displayName}</p>
          {isVerified && (
            <BadgeCheck className="dm-inbox-meta-icon dm-inbox-meta-icon--verified" aria-label="Verified" />
          )}
          {relationshipBadge === 'close_friend' && (
            <Heart className="dm-inbox-meta-icon dm-inbox-meta-icon--heart" aria-label="Best friend" />
          )}
          {relationshipBadge === 'new_friend' && (
            <Sparkles className="dm-inbox-meta-icon dm-inbox-meta-icon--sparkle" aria-label="New friend" />
          )}
          {pinned && <Pin className="dm-inbox-meta-icon" aria-label="Pinned" />}
          {muted && <VolumeX className="dm-inbox-meta-icon" aria-label="Muted" />}
        </div>
        {typing ? (
          <div className="dm-inbox-status dm-inbox-preview--typing">
            <TypingIndicator size="sm" />
            <span>typing…</span>
          </div>
        ) : activity && activity !== 'idle' && activityPreviewLabel(activity) ? (
          <p className="dm-inbox-status dm-inbox-preview--live">
            {activityPreviewLabel(activity)}
          </p>
        ) : (
          <>
            {statusLine && (
              <p
                className={cn(
                  'dm-inbox-status',
                  status.toneClass,
                  unread && 'dm-inbox-preview--unread',
                )}
              >
                <StatusIcon className="dm-inbox-status-icon" aria-hidden />
                <span>{statusLine}</span>
                {streakCount && streakCount > 0 && !statusLine.includes('🔥') ? (
                  <span className="dm-inbox-streak" aria-label={`${streakCount} day streak`}>
                    {streakCount} 🔥
                  </span>
                ) : null}
              </p>
            )}
            {showSeparatePreview && (
              <p className={cn('dm-inbox-message-preview', unread && 'dm-inbox-preview--unread')}>
                {messagePreview}
              </p>
            )}
          </>
        )}
      </div>

      <div className="dm-inbox-row-trail">
        {trailTime ? <span className="dm-inbox-time">{trailTime}</span> : null}
        <div className="dm-inbox-row-trail-actions">
          {quickReaction && (
            <span className="dm-inbox-quick-reaction" aria-hidden>
              {quickReaction}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="dm-inbox-unread-badge" aria-label={`${unreadCount} unread`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <button
            type="button"
            className="dm-inbox-camera-button dm-vfx-press"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openSnapCamera}
            aria-label={`Send a snap to ${displayName}`}
          >
            <Camera />
          </button>
        </div>
      </div>
    </div>
  );
});
