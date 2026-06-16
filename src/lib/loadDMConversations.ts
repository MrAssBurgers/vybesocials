import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import type { Conversation, Message } from '@/hooks/useMessages';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { withTimeout } from '@/lib/withTimeout';

export interface LoadedDMConversation extends Conversation {
  _sortTime: string;
  _hasUnread: boolean;
}

export interface LoadDMConversationsResult {
  data: LoadedDMConversation[];
  error: Error | null;
  profileId: string;
}

/** Write-through to legacy conversations cache key. */
export function syncDmListCaches(
  queryClient: QueryClient,
  profileId: string,
  data: LoadedDMConversation[],
): void {
  queryClient.setQueryData(['dm-conversations', profileId], data);
  queryClient.setQueryData(['conversations', profileId], data);
}

/**
 * Fetch the DM conversation list (same shape as useDMConversations).
 * Fail-soft: returns fallback/stale data on error instead of throwing.
 */
export async function loadDMConversations(
  profileId: string,
  fallback?: LoadedDMConversation[],
): Promise<LoadDMConversationsResult> {
  const stale = fallback?.length ? fallback : [];

  try {
    const result = await withTimeout(
      loadDMConversationsOnce(profileId, stale),
      12_000,
      'Loading chats timed out',
    );
    return result;
  } catch (err) {
    console.warn('[DM] load failed:', err);
    const error = err instanceof Error ? err : new Error(String(err));
    return { data: stale, error, profileId };
  }
}

async function loadDMConversationsOnce(
  profileId: string,
  stale: LoadedDMConversation[],
): Promise<LoadDMConversationsResult> {
  try {
    const effectiveProfileId = (await resolveSessionProfileId(profileId)) ?? profileId;

    const { data: membershipData, error: membershipError } = await db
      .from('conversation_members')
      .select('conversation_id, last_read_at, is_pinned, is_muted')
      .eq('user_id', effectiveProfileId);

    if (membershipError) {
      console.warn('[DM] membership query error:', membershipError.message);
      return { data: stale, error: membershipError, profileId: effectiveProfileId };
    }
    if (!membershipData?.length) {
      return { data: [], error: null, profileId: effectiveProfileId };
    }

    const userConversationIds = membershipData.map((m) => m.conversation_id);
    const membershipMap = new Map(membershipData.map((m) => [m.conversation_id, m]));

    const { data: { session } } = await db.auth.getSession();
    const authUserId = session?.user?.id;

    const [{ data: hiddenData }, { data: trashedData }] = await Promise.all([
      authUserId
        ? db.from('hidden_conversations').select('conversation_id').eq('user_id', authUserId)
        : Promise.resolve({ data: [] as { conversation_id: string }[] }),
      db.from('trashed_conversations').select('conversation_id').eq('user_id', effectiveProfileId),
    ]);
    const hiddenIds = new Set((hiddenData || []).map((h) => h.conversation_id));
    const trashedIds = new Set((trashedData || []).map((t) => t.conversation_id));

    const { data: conversationsRaw, error: convError } = await db
      .from('conversations')
      .select('*')
      .in('id', userConversationIds)
      .order('updated_at', { ascending: false });

    if (convError) {
      console.warn('[DM] conversations query error:', convError.message);
      return { data: stale, error: convError, profileId: effectiveProfileId };
    }
    if (!conversationsRaw?.length) {
      return { data: [], error: null, profileId: effectiveProfileId };
    }

    const { data: allMembers, error: membersError } = await db
      .from('conversation_members')
      .select('conversation_id, user_id, role, is_muted, is_pinned, last_read_at')
      .in('conversation_id', userConversationIds);

    if (membersError) {
      console.warn('[DM] all-members query error:', membersError.message);
    }

    const memberUserIds = Array.from(new Set((allMembers || []).map((m) => m.user_id)));
    const { data: memberProfiles, error: profilesError } = memberUserIds.length
      ? await db
          .from('profiles')
          .select('id, user_id, username, avatar_url, display_name')
          .in('id', memberUserIds)
      : { data: [], error: null };

    if (profilesError) {
      console.warn('[DM] member profiles query error:', profilesError.message);
    }

    const profileById = new Map((memberProfiles || []).map((p) => [p.id, p]));
    const membersByConv = new Map<string, any[]>();
    (allMembers || []).forEach((m) => {
      const arr = membersByConv.get(m.conversation_id) || [];
      arr.push({ ...m, profile: profileById.get(m.user_id) || null });
      membersByConv.set(m.conversation_id, arr);
    });

    const conversationsData = conversationsRaw.map((c) => ({
      ...c,
      members: membersByConv.get(c.id) || [],
    }));

    const convIds = conversationsData.map((c) => c.id);
    const messageLimit = Math.min(Math.max(convIds.length * 3, 60), 250);

    const { data: allMessages, error: messagesError } = await db
      .from('messages')
      .select('id, conversation_id, sender_id, content, media_type, viewed_at, created_at')
      .in('conversation_id', convIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(messageLimit);

    if (messagesError) {
      console.warn('[DM] messages query error:', messagesError.message);
    }

    const lastMessageMap = new Map<string, Message>();
    const unreadCountMap = new Map<string, number>();

    (allMessages || []).forEach((msg) => {
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, msg as Message);
      }
      const membership = membershipMap.get(msg.conversation_id);
      const lastReadAt = membership?.last_read_at || '1970-01-01';
      if (msg.sender_id !== effectiveProfileId && msg.created_at > lastReadAt) {
        unreadCountMap.set(
          msg.conversation_id,
          (unreadCountMap.get(msg.conversation_id) || 0) + 1,
        );
      }
    });

    const seenOtherUserIds = new Set<string>();
    const result: LoadedDMConversation[] = [];

    conversationsData
      .filter((conv) => !hiddenIds.has(conv.id) && !trashedIds.has(conv.id))
      .forEach((conv) => {
        if (!conv.is_group) {
          const otherMember = conv.members?.find((m: any) => m.user_id !== effectiveProfileId);
          const otherUserId = otherMember?.user_id;
          if (otherUserId) {
            if (seenOtherUserIds.has(otherUserId)) return;
            seenOtherUserIds.add(otherUserId);
          }
        }

        const lastMessage = lastMessageMap.get(conv.id) || null;
        const unreadCount = unreadCountMap.get(conv.id) || 0;

        result.push({
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount,
          _sortTime: lastMessage?.created_at || conv.updated_at,
          _hasUnread: unreadCount > 0,
        });
      });

    result.sort((a, b) => {
      const aIsPinned = a.members?.find((m) => m.user_id === effectiveProfileId)?.is_pinned;
      const bIsPinned = b.members?.find((m) => m.user_id === effectiveProfileId)?.is_pinned;
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      if (aIsPinned && bIsPinned) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (a._hasUnread && !b._hasUnread) return -1;
      if (!a._hasUnread && b._hasUnread) return 1;
      return new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime();
    });

    return { data: result, error: null, profileId: effectiveProfileId };
  } catch (err) {
    console.warn('[DM] load failed:', err);
    const error = err instanceof Error ? err : new Error(String(err));
    return { data: stale, error, profileId };
  }
}

/** Warm the React Query cache if DMs are not already loaded. */
export async function prefetchDMConversations(
  queryClient: QueryClient,
  profileId: string,
): Promise<void> {
  const cached = queryClient.getQueryData<LoadedDMConversation[]>(['dm-conversations', profileId]);
  if (Array.isArray(cached) && cached.length > 0) return;

  const { data, profileId: resolvedId } = await loadDMConversations(profileId, cached);
  syncDmListCaches(queryClient, resolvedId, data);
}

/** Best-effort prefetch using the global query client (nav hover). */
export function prefetchDMConversationsFromNav(): void {
  const queryClient = (window as any).__REACT_QUERY_CLIENT__ as QueryClient | null | undefined;
  if (!queryClient) return;

  const entries = queryClient.getQueriesData<LoadedDMConversation[]>({
    queryKey: ['dm-conversations'],
  });
  for (const [key, data] of entries) {
    const profileId = key[1] as string | undefined;
    if (!profileId) continue;
    if (Array.isArray(data) && data.length > 0) return;
    void prefetchDMConversations(queryClient, profileId);
    return;
  }

  void (async () => {
    const resolved = await resolveSessionProfileId();
    if (resolved) {
      void prefetchDMConversations(queryClient, resolved);
    }
  })();
}
