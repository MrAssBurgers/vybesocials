import { memo } from 'react';
import { Users, Pin } from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { safeDmMembers } from '@/lib/persistedCollections';
import { displayNameForConversation, resolveOtherMemberFromConversation } from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { useRecentNewFriendProfileIds } from '@/hooks/useRecentNewFriendProfileIds';
import { compactTime } from '@/lib/compactTime';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { activityPreviewLabel } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { cn } from '@/lib/utils';

export interface DmConversationCardProps {
  conversation: LoadedDMConversation;
  profileId?: string;
  authUid?: string;
  isActive?: boolean;
  priority?: boolean;
  isTyping?: boolean;
  presenceActivity?: ActivityType;
  isSwiping?: boolean;
}

export const DmConversationCard = memo(function DmConversationCard({
  conversation,
  profileId,
  authUid,
  isActive,
  priority = false,
  isTyping = false,
  presenceActivity,
  isSwiping = false,
}: DmConversationCardProps) {
  const { data: recentNewFriendIds = new Set<string>() } = useRecentNewFriendProfileIds();
  const unread = conversation.unread_count || 0;
  const isUnread = unread > 0 || conversation._hasUnread;
  const name = displayNameForConversation(conversation, profileId, authUid, 'Chat');
  const resolvedOther = !conversation.is_group
    ? resolveOtherMemberFromConversation(conversation, profileId, authUid)
    : null;
  const other = resolvedOther?.profile;
  const otherProfileId = other?.id ? String(other.id) : resolvedOther?.user_id;
  const avatar = conversation.is_group
    ? conversation.avatar_url
    : resolveProfileAvatarUrl(otherProfileId, other?.avatar_url as string | null | undefined);
  const isPinned = Boolean(
    safeDmMembers(conversation.members).find((m) => m.user_id === profileId)?.is_pinned,
  );

  const lastMsg = conversation.last_message;
  const preview = dmConversationPreviewText({
    lastMessage: lastMsg,
    isGroup: conversation.is_group,
    profileId,
    authUid,
    otherProfileId: otherProfileId,
    recentNewFriendIds,
    previewMaxLen: 56,
  });

  const timeLabel = lastMsg?.created_at ? compactTime(lastMsg.created_at) : null;

  return (
    <div
      className={cn(
        'dm-inbox-card',
        isActive && 'dm-inbox-card--active',
        isUnread && 'dm-inbox-card--unread',
        isPinned && 'dm-inbox-card--pinned',
        isSwiping && 'dm-inbox-card--swiping',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          {conversation.is_group ? (
            <Avatar
              className={cn(
                'h-12 w-12 border border-border/60',
                isUnread && 'ring-2 ring-primary/50',
              )}
            >
              {avatar ? (
                <ProfileAvatarImage src={avatar} transformSize={128} priority={priority} />
              ) : (
                <AvatarFallback className="bg-primary/15 text-primary">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              )}
            </Avatar>
          ) : (
            <Avatar
              className={cn(
                'h-12 w-12 border border-border/60',
                isUnread && 'ring-2 ring-primary/50',
              )}
            >
              <ProfileAvatarImage
                profileId={otherProfileId}
                src={avatar || undefined}
                transformSize={128}
                priority={priority}
              />
              <AvatarFallback className="text-sm font-semibold bg-primary/15 text-primary">
                {String(name || '?')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          {isPinned && (
            <span className="dm-inbox-pin" aria-label="Pinned">
              <Pin className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn('dm-inbox-name truncate', isUnread && 'dm-inbox-name--unread')}>
              {name}
            </p>
            {timeLabel && (
              <span className={cn('dm-inbox-time shrink-0', isUnread && 'dm-inbox-time--unread')}>
                {timeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0 mt-0.5">
            {isTyping ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <TypingIndicator size="sm" />
                <span className="text-xs text-primary font-medium">typing…</span>
              </div>
            ) : presenceActivity && presenceActivity !== 'idle' ? (
              <p className="text-xs text-primary truncate flex-1">{activityPreviewLabel(presenceActivity)}</p>
            ) : (
              <p className={cn('dm-inbox-preview truncate flex-1', isUnread && 'dm-inbox-preview--unread')}>
                {preview}
              </p>
            )}
            {isUnread && (
              <span className="dm-inbox-unread-badge" aria-label={`${unread || 1} unread`}>
                {unread > 9 ? '9+' : unread || '•'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
