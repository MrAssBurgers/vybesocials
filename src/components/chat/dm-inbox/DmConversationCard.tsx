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
    previewMaxLen: 52,
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
            <Avatar className="h-14 w-14">
              {avatar ? (
                <ProfileAvatarImage src={avatar} transformSize={128} priority={priority} />
              ) : (
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              )}
            </Avatar>
          ) : (
            <Avatar className="h-14 w-14">
              <ProfileAvatarImage
                profileId={otherProfileId}
                src={avatar || undefined}
                transformSize={128}
                priority={priority}
              />
              <AvatarFallback className="text-base font-semibold bg-muted text-foreground">
                {String(name || '?')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          {isUnread && (
            <span className="dm-inbox-unread-dot" aria-hidden />
          )}
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <p className={cn('dm-inbox-name truncate', isUnread && 'dm-inbox-name--unread')}>
                {name}
              </p>
              {isPinned && (
                <Pin className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Pinned" />
              )}
            </div>
            {timeLabel && (
              <span className={cn('dm-inbox-time shrink-0', isUnread && 'dm-inbox-time--unread')}>
                {timeLabel}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0 mt-1">
            {isTyping ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <TypingIndicator size="sm" />
                <span className="dm-inbox-preview dm-inbox-preview--typing">typing…</span>
              </div>
            ) : presenceActivity && presenceActivity !== 'idle' ? (
              <p className="dm-inbox-preview dm-inbox-preview--live truncate flex-1">
                {activityPreviewLabel(presenceActivity)}
              </p>
            ) : (
              <p className={cn('dm-inbox-preview truncate flex-1', isUnread && 'dm-inbox-preview--unread')}>
                {preview}
              </p>
            )}
            {isUnread && unread > 0 && (
              <span className="dm-inbox-unread-badge" aria-label={`${unread} unread`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
