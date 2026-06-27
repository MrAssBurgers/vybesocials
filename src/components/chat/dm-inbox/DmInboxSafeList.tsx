/**
 * Minimal DM inbox fallback — no swipe/options, safe string rendering only.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { displayNameForConversation } from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { useRecentNewFriendProfileIds } from '@/hooks/useRecentNewFriendProfileIds';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function DmInboxSafeList() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const { data: recentNewFriendIds = new Set<string>() } = useRecentNewFriendProfileIds();
  const { pinnedConversations, unpinnedConversations, isLoading, refetch, error } =
    useDMConversations();

  const rows = [
    ...ensureArray(pinnedConversations),
    ...ensureArray(unpinnedConversations),
  ];

  const openChat = useCallback(
    (id: string) => navigate(`/messages/${id}`),
    [navigate],
  );

  if (isLoading && rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Loading chats…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-3">
        <MessageCircle className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        {error && (
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto scroller px-3 py-2 gap-1">
      {rows.map((conv) => {
        const name = displayNameForConversation(conv, profileId, undefined, 'Chat');
        const preview = dmConversationPreviewText({
          lastMessage: conv.last_message,
          isGroup: conv.is_group,
          profileId,
          otherProfileId: safeDmMembers(conv.members).find((m) => m.user_id !== profileId)?.profile?.id,
          recentNewFriendIds,
          previewMaxLen: 48,
        });
        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => openChat(conv.id)}
            className="flex items-center gap-3 w-full text-left p-3 rounded-2xl hover:bg-foreground/5 transition-colors"
          >
            <Avatar className="h-11 w-11">
              <AvatarImage src={typeof conv.avatar_url === 'string' ? conv.avatar_url : undefined} />
              <AvatarFallback>{String(name || '?')[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{preview}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
