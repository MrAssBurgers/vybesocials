import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2, MessageCircle, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useFriends } from '@/hooks/useFriends';
import { useDMInbox } from '@/features/dms/useDMInbox';
import {
  useMessagesSearch,
  type MessagesSearchConversationHit,
  type MessagesSearchPerson,
  type SearchableConversation,
} from '@/hooks/useMessagesSearch';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { sortDmConversations } from '@/lib/dmConversationSort';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import {
  getRecentDmSearches,
  pushRecentDmSearch,
  removeRecentDmSearch,
  clearRecentDmSearches,
  type RecentDmSearchEntry,
} from '@/lib/dmSearchHistory';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

const RECENT_CONVERSATION_COUNT = 6;
const SUGGESTED_PEOPLE_COUNT = 8;

function toSearchableConversation(
  conversation: LoadedDMConversation,
  profileId?: string,
  authUid?: string,
): SearchableConversation {
  const resolved = conversation.is_group
    ? null
    : resolveOtherMemberFromConversation(conversation, profileId, authUid);
  const other = resolved?.profile as
    | { id?: string; username?: string; avatar_url?: string | null }
    | null
    | undefined;
  const otherProfileId = other?.id ? String(other.id) : resolved?.user_id;

  return {
    conversationId: conversation.id,
    displayName: displayNameForConversation(conversation, profileId, authUid, 'Chat'),
    username: typeof other?.username === 'string' ? other.username : undefined,
    avatarUrl: conversation.is_group
      ? conversation.avatar_url || undefined
      : resolveProfileAvatarUrl(otherProfileId, other?.avatar_url) || undefined,
    previewText: dmConversationPreviewText({
      lastMessage: conversation.last_message,
      isGroup: conversation.is_group,
      profileId,
      authUid,
      otherProfileId,
      previewMaxLen: 48,
    }),
    isGroup: Boolean(conversation.is_group),
  };
}

function ConversationHitRow({
  hit,
  onSelect,
}: {
  hit: SearchableConversation;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hit.conversationId)}
      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-card/80 active:scale-[0.99]"
    >
      <Avatar className="h-11 w-11 shrink-0">
        {hit.isGroup && !hit.avatarUrl ? (
          <AvatarFallback className="bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </AvatarFallback>
        ) : (
          <>
            <ProfileAvatarImage src={hit.avatarUrl} transformSize={128} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {hit.displayName[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{hit.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{hit.previewText || 'No messages yet'}</p>
      </div>
    </button>
  );
}

function PersonHitRow({
  person,
  isStartingChat,
  onSelect,
  onOpenProfile,
}: {
  person: MessagesSearchPerson;
  isStartingChat: boolean;
  onSelect: (person: MessagesSearchPerson) => void;
  onOpenProfile: (username: string) => void;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-card/80">
      <button
        type="button"
        onClick={() => onOpenProfile(person.username)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar className="h-11 w-11 shrink-0">
          <ProfileAvatarImage profileId={person.id} src={person.avatar_url} transformSize={128} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {(person.display_name || person.username)?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {person.display_name || person.username}
          </p>
          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
        </div>
      </button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs"
        disabled={isStartingChat}
        onClick={() => onSelect(person)}
      >
        {isStartingChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        Chat
      </Button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-sm font-semibold text-foreground">{children}</h2>;
}

function ResultsSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessagesSearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const [rawQuery, setRawQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentDmSearchEntry[]>([]);
  const [startingChatFor, setStartingChatFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inbox = useDMInbox();
  const { data: friends } = useFriends();

  useEffect(() => {
    setRecentSearches(getRecentDmSearches());
    inputRef.current?.focus();
  }, []);

  const fallbackConversations = useMemo<SearchableConversation[]>(
    () => inbox.allConversations.map((conversation) => toSearchableConversation(conversation, profileId, user?.id)),
    [inbox.allConversations, profileId, user?.id],
  );

  const recentConversations = useMemo<SearchableConversation[]>(() => {
    const sorted = sortDmConversations(inbox.allConversations, profileId);
    return sorted
      .slice(0, RECENT_CONVERSATION_COUNT)
      .map((conversation) => toSearchableConversation(conversation, profileId, user?.id));
  }, [inbox.allConversations, profileId, user?.id]);

  const recentConversationOtherIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conversation of inbox.allConversations) {
      if (conversation.is_group) continue;
      const resolved = resolveOtherMemberFromConversation(conversation, profileId, user?.id);
      const other = resolved?.profile as { id?: string } | null | undefined;
      const id = other?.id ? String(other.id) : resolved?.user_id;
      if (id) ids.add(id);
    }
    return ids;
  }, [inbox.allConversations, profileId, user?.id]);

  const suggestedPeople = useMemo(() => {
    return (friends || [])
      .filter((friend): friend is MessagesSearchPerson =>
        Boolean(friend?.id && friend.username && !recentConversationOtherIds.has(String(friend.id))),
      )
      .slice(0, SUGGESTED_PEOPLE_COUNT);
  }, [friends, recentConversationOtherIds]);

  const search = useMessagesSearch(rawQuery, profileId, fallbackConversations);

  const commitSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(pushRecentDmSearch(trimmed));
  }, []);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (search.hasQuery) commitSearch(search.query);
      navigate(`/messages/${conversationId}`);
    },
    [commitSearch, navigate, search.hasQuery, search.query],
  );

  const handleSelectPerson = useCallback(
    async (person: MessagesSearchPerson) => {
      if (!profileId || startingChatFor) return;
      if (search.hasQuery) commitSearch(search.query);
      setStartingChatFor(person.id);
      try {
        const { data: conversationId, error } = await db.rpc('create_dm_conversation', {
          other_profile_id: person.id,
        });
        if (error) throw error;
        if (conversationId) {
          navigate(`/messages/${String(conversationId)}`);
        } else {
          toast.error("Couldn't start that chat");
        }
      } catch (err) {
        console.error('[messages-search] start chat failed', err);
        toast.error("Couldn't start that chat");
      } finally {
        setStartingChatFor(null);
      }
    },
    [commitSearch, navigate, profileId, search.hasQuery, search.query, startingChatFor],
  );

  const handleOpenProfile = useCallback(
    (username: string) => {
      if (search.hasQuery) commitSearch(search.query);
      openFriendProfile(navigate, { username, friendshipStatus: 'friends' });
    },
    [commitSearch, navigate, search.hasQuery, search.query],
  );

  const handleRecentSearchTap = useCallback((term: string) => {
    setRawQuery(term);
    setRecentSearches(pushRecentDmSearch(term));
  }, []);

  const handleRemoveRecentSearch = useCallback((term: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setRecentSearches(removeRecentDmSearch(term));
  }, []);

  const clearSearch = useCallback(() => {
    setRawQuery('');
    inputRef.current?.focus();
  }, []);

  const showEmptyState =
    search.hasQuery && !search.isSearching && search.people.length === 0 && search.conversations.length === 0;

  return (
    <AppLayout>
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-2xl flex-col md:h-screen">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/messages')}
            aria-label="Back to messages"
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitSearch(rawQuery);
              }}
              placeholder="Search people and chats"
              className="h-10 rounded-full pl-9 pr-9"
              aria-label="Search messages"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5 p-4">
            {!search.hasQuery ? (
              <>
                {recentSearches.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <SectionLabel>Recent</SectionLabel>
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentDmSearches();
                          setRecentSearches([]);
                        }}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((entry) => (
                        <button
                          key={entry.query}
                          type="button"
                          onClick={() => handleRecentSearchTap(entry.query)}
                          className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card"
                        >
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {entry.query}
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(event) => handleRemoveRecentSearch(entry.query, event)}
                            className="ml-0.5 rounded-full p-0.5 text-muted-foreground/70 group-hover:text-foreground"
                            aria-label={`Remove "${entry.query}" from recent searches`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {recentConversations.length > 0 && (
                  <section className="space-y-1">
                    <SectionLabel>Recent conversations</SectionLabel>
                    <div className="space-y-0.5">
                      {recentConversations.map((hit) => (
                        <ConversationHitRow
                          key={hit.conversationId}
                          hit={hit}
                          onSelect={handleSelectConversation}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {suggestedPeople.length > 0 && (
                  <section className="space-y-1">
                    <SectionLabel>Suggested people</SectionLabel>
                    <div className="space-y-0.5">
                      {suggestedPeople.map((person) => (
                        <PersonHitRow
                          key={person.id}
                          person={person}
                          isStartingChat={startingChatFor === person.id}
                          onSelect={handleSelectPerson}
                          onOpenProfile={handleOpenProfile}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {recentSearches.length === 0 &&
                  recentConversations.length === 0 &&
                  suggestedPeople.length === 0 && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Search for people or conversations by name.
                    </p>
                  )}
              </>
            ) : (
              <>
                {search.isSearching && search.conversations.length === 0 && search.people.length === 0 ? (
                  <ResultsSkeleton />
                ) : (
                  <>
                    {search.conversations.length > 0 && (
                      <section className="space-y-1">
                        <SectionLabel>Chats</SectionLabel>
                        <div className="space-y-0.5">
                          {search.conversations.map((hit: MessagesSearchConversationHit) => (
                            <ConversationHitRow
                              key={hit.conversationId}
                              hit={hit}
                              onSelect={handleSelectConversation}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {search.people.length > 0 && (
                      <section className="space-y-1">
                        <SectionLabel>People</SectionLabel>
                        <div className="space-y-0.5">
                          {search.people.map((person) => (
                            <PersonHitRow
                              key={person.id}
                              person={person}
                              isStartingChat={startingChatFor === person.id}
                              onSelect={handleSelectPerson}
                              onOpenProfile={handleOpenProfile}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {showEmptyState && (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        No people or chats found for &ldquo;{search.query}&rdquo;
                      </p>
                    )}

                    {search.error && (
                      <p className="text-center text-xs text-destructive">
                        Some results may be missing — search hit an error.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
