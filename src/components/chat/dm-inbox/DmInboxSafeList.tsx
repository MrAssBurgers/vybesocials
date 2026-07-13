/**
 * Minimal DM inbox fallback when the primary inbox subtree errors.
 * Intentionally silent — no “safe mode” banner.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MessageCircle, RefreshCw } from 'lucide-react';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { ensureArray } from '@/lib/persistedCollections';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { dmInboxPreviewStatus } from '@/lib/dmInboxPreviewStatus';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

export function DmInboxSafeList() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const { user } = useAuth();
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
      <div className="dm-inbox flex flex-1 min-h-0">
        <div className="dm-inbox-list flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Loading chats…
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="dm-inbox flex flex-1 min-h-0">
        <div className="dm-inbox-empty flex-1">
          <div className="dm-inbox-empty-icon">
            <MessageCircle />
          </div>
          <h2>No conversations yet</h2>
          <p>Start a chat to see your inbox here.</p>
          {error && (
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dm-inbox flex flex-1 min-h-0 flex-col">
      <div className="dm-inbox-list scroller flex-1 min-h-0 overflow-y-auto">
        <div className="dm-inbox-rows">
          {rows.map((conv) => {
            const name = displayNameForConversation(conv, profileId, user?.id, 'Chat');
            const resolved = !conv.is_group
              ? resolveOtherMemberFromConversation(conv, profileId, user?.id)
              : null;
            const other = resolved?.profile;
            const otherProfileId = other?.id ? String(other.id) : resolved?.user_id;
            const avatarUrl = conv.is_group
              ? conv.avatar_url || undefined
              : resolveProfileAvatarUrl(
                  otherProfileId,
                  other?.avatar_url as string | null | undefined,
                ) || undefined;
            const statusLine = dmInboxPreviewStatus(conv, profileId, user?.id);
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => openChat(conv.id)}
                className="dm-inbox-row-tap w-full text-left"
              >
                <div className="dm-inbox-card">
                  <div className="dm-inbox-avatar-button">
                    <span className="dm-inbox-avatar-ring" aria-hidden />
                    <Avatar className="dm-inbox-avatar">
                      <ProfileAvatarImage
                        profileId={otherProfileId}
                        src={avatarUrl}
                        transformSize={128}
                      />
                      <AvatarFallback className="bg-muted text-sm font-semibold">
                        {String(name || '?')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="dm-inbox-row-copy">
                    <p className="dm-inbox-name truncate">{name}</p>
                    <p className="dm-inbox-status truncate">{statusLine}</p>
                  </div>
                  <span className="dm-inbox-camera-button" aria-hidden>
                    <Camera />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
