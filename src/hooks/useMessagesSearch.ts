import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { searchDmInboxEntriesByToken } from '@/lib/dmInboxProjection';

export interface MessagesSearchPerson {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Lightweight, already-resolved conversation row — built by the caller from
 * whichever inbox source (projection or legacy) is currently loaded. */
export interface SearchableConversation {
  conversationId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  previewText: string;
  isGroup: boolean;
}

export interface MessagesSearchConversationHit extends SearchableConversation {
  source: 'projection' | 'client';
}

const MIN_QUERY_LEN = 1;
const PEOPLE_LIMIT = 12;
const CONVERSATION_LIMIT = 10;

async function searchPeopleProfiles(
  query: string,
  excludeProfileId?: string | null,
): Promise<MessagesSearchPerson[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(PEOPLE_LIMIT + 1);
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return ((data || []) as MessagesSearchPerson[])
    .filter((person) => person.id !== excludeProfileId)
    .slice(0, PEOPLE_LIMIT);
}

function matchesQuery(conversation: SearchableConversation, loweredQuery: string): boolean {
  return (
    conversation.displayName.toLowerCase().includes(loweredQuery) ||
    Boolean(conversation.username?.toLowerCase().includes(loweredQuery)) ||
    conversation.previewText.toLowerCase().includes(loweredQuery)
  );
}

/**
 * Debounced, abortable search across people + conversations for
 * `/messages/search`. "Abortable" here follows the same stale-response guard
 * used by `useDmInboxProjection` — a monotonically increasing request id
 * discards results from superseded searches instead of racing them.
 *
 * Conversation matches prefer the server-generated `search_tokens` field on
 * `dm_inbox_entries` (one indexed array-contains query, no N+1). If that
 * throws or comes back empty (index still building, projection not yet
 * enabled, query too short to tokenize) we fall back to filtering whatever
 * inbox rows the caller already has loaded.
 */
export function useMessagesSearch(
  rawQuery: string,
  profileId: string | null | undefined,
  fallbackConversations: SearchableConversation[],
) {
  const query = useDebouncedValue(rawQuery.trim(), 250);
  const [people, setPeople] = useState<MessagesSearchPerson[]>([]);
  const [conversations, setConversations] = useState<MessagesSearchConversationHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const fallbackRef = useRef(fallbackConversations);
  fallbackRef.current = fallbackConversations;

  useEffect(() => {
    if (query.length < MIN_QUERY_LEN || !profileId) {
      requestIdRef.current += 1;
      setPeople([]);
      setConversations([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;
    setIsSearching(true);
    setError(null);

    void (async () => {
      let projectionHits: MessagesSearchConversationHit[] = [];
      try {
        const rows = await searchDmInboxEntriesByToken(profileId, query, CONVERSATION_LIMIT);
        projectionHits = rows.map((entry) => ({
          conversationId: entry.conversation_id,
          displayName: entry.display_name,
          username: entry.username ?? null,
          avatarUrl: entry.avatar_url ?? null,
          previewText: entry.preview_text,
          isGroup: entry.conversation_type === 'group',
          source: 'projection' as const,
        }));
      } catch (err) {
        console.warn('[messages-search] token search failed, using client filter', err);
      }
      if (isStale()) return;

      const loweredQuery = query.toLowerCase();
      const conversationHits = projectionHits.length
        ? projectionHits
        : fallbackRef.current
            .filter((conversation) => matchesQuery(conversation, loweredQuery))
            .slice(0, CONVERSATION_LIMIT)
            .map((conversation) => ({ ...conversation, source: 'client' as const }));

      let peopleHits: MessagesSearchPerson[] = [];
      try {
        peopleHits = await searchPeopleProfiles(query, profileId);
      } catch (err) {
        if (!isStale()) setError(err instanceof Error ? err : new Error(String(err)));
      }
      if (isStale()) return;

      setConversations(conversationHits);
      setPeople(peopleHits);
      setIsSearching(false);
    })();
  }, [query, profileId]);

  return {
    query,
    hasQuery: query.length >= MIN_QUERY_LEN,
    people,
    conversations,
    isSearching,
    error,
  };
}
