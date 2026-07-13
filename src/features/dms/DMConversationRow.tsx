import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Heart,
  Image as ImageIcon,
  MapPin,
  Mic,
  Moon,
  Sparkles,
  Users,
  Video,
  Zap,
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
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import {
  openCameraFromGesture,
  useCameraOverlayOptional,
} from '@/contexts/CameraOverlayContext';
import { insertDmMessage } from '@/lib/dmSendCore';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
}: DMConversationRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cameraOverlay = useCameraOverlayOptional();
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const statusLine = typing
    ? 'Typing…'
    : preview?.statusLine || status.line;
  const storyState = preview?.storyState || 'none';
  const isOnline = preview?.isOnline ?? Boolean(activity && activity !== 'idle');
  const isAway = preview?.isAway ?? false;
  const secondaryAvatarUrl = preview?.secondaryAvatarUrl;
  const relationship = preview?.relationshipBadge;
  const quickReaction = preview?.quickReaction;
  const isVerified = preview?.isVerified;
  const ringTone = useMemo(() => ringToneForId(conversation.id), [conversation.id]);

  const stopRowGesture = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openProfile = (event: React.SyntheticEvent) => {
    stopRowGesture(event);
    if (username) openFriendProfile(navigate, { username, friendshipStatus: 'friends' });
  };

  const openSnapCamera = useCallback(
    (mode: 'photo' | 'video' | 'default' = 'default') => {
      if (!profileId) {
        toast.error('Sign in to send a snap');
        return;
      }
      if (!cameraOverlay) {
        navigate(`/messages/${conversation.id}?camera=1`);
        return;
      }
      openCameraFromGesture(cameraOverlay.openCamera, 'dm', {
        defaultMode: mode === 'video' ? 'video' : mode === 'photo' ? 'photo' : undefined,
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
        isSwiping && 'dm-inbox-card--swiping',
      )}
    >
      <button
        type="button"
        className={cn(
          'dm-inbox-avatar-button dm-vfx-press',
          storyState === 'unviewed' && 'dm-inbox-avatar-button--story',
          storyState === 'viewed' && 'dm-inbox-avatar-button--story-viewed',
        )}
        onPointerDown={(event) => {
          if (username) event.stopPropagation();
        }}
        onClick={openProfile}
        aria-label={username ? `Open ${displayName}'s profile` : displayName}
        disabled={!username}
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
          <p className={cn('dm-inbox-name', unread && 'dm-inbox-name--unread')}>{displayName}</p>
          {relationship === 'close_friend' && (
            <Zap className="dm-inbox-meta-icon dm-inbox-meta-icon--sparkle" aria-hidden />
          )}
          {relationship === 'new_friend' && (
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
          {!typing && <StatusIcon className="dm-inbox-status-icon" aria-hidden />}
          <span>{statusLine}</span>
        </p>
      </div>

      <div className="dm-inbox-row-trail">
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
          onPointerDown={(event) => {
            event.stopPropagation();
            clearLongPress();
            longPressTimer.current = setTimeout(() => {
              setCaptureSheetOpen(true);
            }, 420);
          }}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onClick={(event) => {
            stopRowGesture(event);
            if (captureSheetOpen) return;
            openSnapCamera('default');
          }}
          aria-label={`Send a VYBE to ${displayName}`}
        >
          <Camera />
        </button>
      </div>

      <Sheet open={captureSheetOpen} onOpenChange={setCaptureSheetOpen}>
        <SheetContent side="bottom" className="dm-inbox-compose-sheet rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Send to {displayName}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1 pb-6">
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setCaptureSheetOpen(false);
                openSnapCamera('photo');
              }}
            >
              <ImageIcon className="h-5 w-5" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setCaptureSheetOpen(false);
                openSnapCamera('video');
              }}
            >
              <Video className="h-5 w-5" />
              <span>Video</span>
            </button>
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setCaptureSheetOpen(false);
                navigate(`/messages/${conversation.id}?voice=1`);
              }}
            >
              <Mic className="h-5 w-5" />
              <span>Voice</span>
            </button>
            <button
              type="button"
              className="dm-inbox-compose-action"
              onClick={() => {
                setCaptureSheetOpen(false);
                navigate(`/messages/${conversation.id}?location=1`);
              }}
            >
              <MapPin className="h-5 w-5" />
              <span>Location</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
});
