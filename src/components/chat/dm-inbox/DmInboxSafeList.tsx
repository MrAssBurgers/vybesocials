/**
 * Lightweight fallback if the primary inbox errors.
 * Still shows Chat chrome — never a blank “safe mode” strip.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MessageCircle, RefreshCw, Search, UserPlus } from 'lucide-react';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { ensureArray } from '@/lib/persistedCollections';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { resolveDmInboxStatus } from '@/lib/dmInboxStatus';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { ChatSearchSheet } from '@/components/chat/ChatSearchSheet';

export function DmInboxSafeList() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const { profile, user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
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

  return (
    <section className="dm-inbox" aria-label="Direct messages">
      <div className="dm-inbox-column">
        <header className="dm-inbox-hero">
          <div className="dm-inbox-header-bar">
            <div className="dm-inbox-header-side">
              <button
                type="button"
                className="dm-inbox-profile-button"
                aria-label="Open your profile"
                onClick={() => {
                  if (profile?.username) {
                    openFriendProfile(navigate, {
                      username: profile.username,
                      friendshipStatus: 'friends',
                    });
                  }
                }}
              >
                <Avatar className="h-11 w-11">
                  <ProfileAvatarImage
                    profileId={profile?.id}
                    src={profile?.avatar_url || undefined}
                    priority
                  />
                  <AvatarFallback className="bg-muted text-sm font-semibold">
                    {profile?.username?.[0]?.toUpperCase() || 'V'}
                  </AvatarFallback>
                </Avatar>
                <span className="dm-inbox-online-dot" aria-hidden />
              </button>
              <button
                type="button"
                className="dm-inbox-header-action"
                onClick={() => setSearchOpen(true)}
                aria-label="Search chats"
              >
                <Search />
              </button>
            </div>
            <div className="dm-inbox-header-title-wrap">
              <h1 className="dm-inbox-title">Chat</h1>
            </div>
            <div className="dm-inbox-header-side dm-inbox-header-side--right">
              <button
                type="button"
                className="dm-inbox-header-action"
                onClick={() => navigate('/messages/new')}
                aria-label="New chat"
              >
                <UserPlus />
              </button>
            </div>
          </div>
        </header>

        <div className="dm-inbox-list scroller">
          {isLoading && rows.length === 0 ? (
            <div className="dm-inbox-empty">
              <p>Loading chats…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="dm-inbox-empty">
              <span className="dm-inbox-empty-icon">
                <MessageCircle />
              </span>
              <h2>No chats yet</h2>
              <p>Message friends, share snaps, and keep the streak alive.</p>
              {error && (
                <Button size="sm" variant="secondary" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry
                </Button>
              )}
            </div>
          ) : (
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
                const status = resolveDmInboxStatus(conv, profileId, user?.id);
                const StatusIcon = status.Icon;
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
                        <p className={`dm-inbox-status truncate ${status.toneClass}`}>
                          <StatusIcon className="dm-inbox-status-icon" aria-hidden />
                          <span>{status.line}</span>
                        </p>
                      </div>
                      <div className="dm-inbox-row-trail">
                        <span className="dm-inbox-camera-button" aria-hidden>
                          <Camera />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ChatSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />
    </section>
  );
}
