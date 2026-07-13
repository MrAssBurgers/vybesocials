import { memo, useCallback, useMemo } from 'react';
import {
  Camera,
  Heart,
  Moon,
  Phone,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { resolveDmInboxStatus } from '@/lib/dmInboxStatus';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import {
  openSnapCamera,
  useCameraOverlayOptional,
} from '@/contexts/CameraOverlayContext';
import { cn } from '@/lib/utils';
import { useCallStore } from '@/lib/callStore';
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
  onStoryTap?: (profileId: string) => void;
  onQuickReply?: () => void;
}

function ringToneForId(id: string): 0 | 1 | 2 | 3 {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return (hash % 4) as 0 | 1 | 2 | 3;
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
  onStoryTap,
  onQuickReply,
}: DMConversationRowProps) {
  const navigate = useNavigate();
  const cameraOverlay = useCameraOverlayOptional();
  const callStore = useCallStore();

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
  const unreadCount = preview?.unreadCount ?? conversation.unread_count ?? 0;
  const unread =
    preview?.isUnread ?? (unreadCount > 0 || conversation._hasUnread);
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
  const StatusIcon = status.Icon;
  const statusKind = preview?.statusKind || status.kind;
  const statusLine = typing
    ? 'Typing…'
    : preview?.statusLine || status.line;
  const storyState = preview?.storyState || 'none';
  const isOnline = preview?.isOnline ?? Boolean(activity && activity !== 'idle');
  const isAway = preview?.isAway ?? false;
  const secondaryAvatarUrl = preview?.secondaryAvatarUrl;
  const relationship = preview?.relationshipBadge;
  const relationshipEmoji = preview?.relationshipEmoji;
  const quickReaction = preview?.quickReaction;
  const isVerified = preview?.isVerified;
  const isCategoryDimmed = preview?.isCategoryDimmed;
  const showQuickReply = preview?.showQuickReply;
  const showCallback = preview?.showCallback;
  const ringTone = useMemo(() => ringToneForId(conversation.id), [conversation.id]);

  const stopRowGesture = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openProfile = (event: React.SyntheticEvent) => {
    stopRowGesture(event);
    if (storyState !== 'none' && otherProfileId && onStoryTap) {
      onStoryTap(otherProfileId);
      return;
    }
    if (username) openFriendProfile(navigate, { username, friendshipStatus: 'friends' });
  };

  const startCallback = useCallback(
    (event: React.SyntheticEvent) => {
      stopRowGesture(event);
      if (!otherProfileId || callStore.state.phase !== 'idle') return;
      const callType =
        preview?.callSummary?.callType === 'video' ? 'video' : 'audio';
      void callStore.startCall({
        callType,
        conversationId: conversation.id,
        receiverId: otherProfileId,
        receiverUsername: username,
        receiverDisplayName: displayName,
        receiverAvatarUrl: avatarUrl,
      });
    },
    [
      otherProfileId,
      callStore,
      preview?.callSummary?.callType,
      conversation.id,
      username,
      displayName,
      avatarUrl,
    ],
  );

  const launchSnapCamera = useCallback(
    (mode: 'photo' | 'video' | 'default' = 'default') => {
      if (!profileId) {
        toast.error('Sign in to send a snap');
        return;
      }
      if (!cameraOverlay) {
        navigate(`/messages/${conversation.id}?camera=1`);
        return;
      }
      const other = conversation.members?.find(
        (m) => m.user_id !== profileId && m.profile?.id,
      )?.profile;
      openSnapCamera(cameraOverlay.openCamera, {
        source: conversation.is_group ? 'group' : 'conversation',
        conversationId: conversation.is_group ? undefined : conversation.id,
        groupId: conversation.is_group ? conversation.id : undefined,
        recipientIds: !conversation.is_group && other?.id ? [other.id] : undefined,
        returnRoute: window.location.pathname,
      }, {
        defaultMode: mode === 'video' ? 'video' : mode === 'photo' ? 'photo' : undefined,
      });
    },
    [conversation.id, conversation.is_group, conversation.members, cameraOverlay, navigate, profileId],
  );

  return (
    <div
      className={cn(
        'dm-inbox-card',
        isActive && 'dm-inbox-card--active',
        unread && 'dm-inbox-card--unread',
        isSwiping && 'dm-inbox-card--swiping',
        isCategoryDimmed && 'dm-inbox-card--category-dim',
      )}
    >
      <button
        type="button"
        className={cn(
          'dm-inbox-avatar-button dm-vfx-press',
          storyState === 'unviewed' && 'dm-inbox-avatar-button--story',
          storyState === 'viewed' && 'dm-inbox-avatar-button--story-viewed',
        )}
        onClick={openProfile}
        aria-label={
          storyState !== 'none' && onStoryTap
            ? `View ${displayName}'s story`
            : username
              ? `Open ${displayName}'s profile`
              : displayName
        }
        disabled={!username && !(storyState !== 'none' && onStoryTap)}
      >
        <span
          className={cn(
            'dm-inbox-avatar-ring',
            `dm-inbox-avatar-ring--tone-${ringTone}`,
            storyState === 'unviewed' && 'dm-inbox-avatar-ring--story',
          )}
          aria-hidden
        />
        <Avatar className="dm-inbox-avatar">
          {conversation.is_group && !avatarUrl ? (
            <AvatarFallback className="bg-muted text-muted-foreground">
              <Users className="h-4 w-4" />
            </AvatarFallback>
          ) : (
            <>
              <ProfileAvatarImage
                profileId={otherProfileId}
                src={avatarUrl}
                transformSize={96}
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
          <p className={cn('dm-inbox-name', unread && 'dm-inbox-name--unread')}>
            {displayName}
            {relationshipEmoji ? (
              <span className="dm-inbox-relationship-emoji" aria-hidden>
                {' '}
                {relationshipEmoji}
              </span>
            ) : null}
          </p>
          {!relationshipEmoji && relationship === 'close_friend' && (
            <Zap className="dm-inbox-meta-icon dm-inbox-meta-icon--sparkle" aria-hidden />
          )}
          {!relationshipEmoji && relationship === 'new_friend' && (
            <Sparkles className="dm-inbox-meta-icon dm-inbox-meta-icon--verified" aria-hidden />
          )}
          {isVerified && (
            <Heart className="dm-inbox-meta-icon dm-inbox-meta-icon--heart" aria-hidden />
          )}
        </div>
        <p
          className={cn(
            'dm-inbox-status',
            status.toneClass,
            unread && 'dm-inbox-preview--unread',
            typing && 'dm-inbox-preview--typing',
          )}
        >
          {!typing && (
            <span
              className={cn('dm-inbox-status-glyph', `dm-inbox-status-glyph--${statusKind}`)}
              aria-hidden
            >
              <StatusIcon className="dm-inbox-status-icon" />
            </span>
          )}
          <span>{statusLine}</span>
        </p>
      </div>

      <div className="dm-inbox-row-trail">
        {showQuickReply && onQuickReply ? (
          <button
            type="button"
            className="dm-inbox-quick-action dm-vfx-press"
            onClick={(event) => {
              stopRowGesture(event);
              onQuickReply();
            }}
          >
            Reply
          </button>
        ) : null}
        {showCallback && otherProfileId ? (
          <button
            type="button"
            className="dm-inbox-quick-action dm-vfx-press"
            onClick={startCallback}
            aria-label={`Call back ${displayName}`}
          >
            <Phone className="h-4 w-4" />
          </button>
        ) : null}
        {quickReaction ? (
          <span className="dm-inbox-quick-reaction" aria-hidden>
            {quickReaction}
          </span>
        ) : null}
        {unreadCount > 0 && (
          <span className="dm-inbox-unread-badge" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <button
          type="button"
          className="dm-inbox-camera-button dm-vfx-press"
          data-dm-camera-shortcut
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            stopRowGesture(event);
            launchSnapCamera('default');
          }}
          aria-label={`Send a VYBE to ${displayName}`}
        >
          <Camera />
        </button>
      </div>
    </div>
  );
});
