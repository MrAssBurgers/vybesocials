import type { QueryClient } from '@tanstack/react-query';
import { prewarmDmBroadcastChannel } from '@/lib/dmBroadcast';
import { loadConversationMessages } from '@/lib/loadConversationMessages';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { messagesQueryKey, readMessagesCache } from '@/lib/messagesQueryKey';
import { buildConversationPlaceholder } from '@/lib/dmMembershipRepair';
import {
  ensureArray,
  findInQueryArray,
  normalizeDmConversation,
} from '@/lib/persistedCollections';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

type DMConversation = LoadedDMConversation;

export function findCachedDmConversation(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
): DMConversation | undefined {
  if (!conversationId) return undefined;

  const keys = [profileId].filter(Boolean) as string[];
  for (const key of keys) {
    const hit =
      findInQueryArray(
        queryClient.getQueryData<DMConversation[]>(['dm-conversations', key]),
        (c) => c.id === conversationId,
      ) ??
      findInQueryArray(
        queryClient.getQueryData<DMConversation[]>(['conversations', key]),
        (c) => c.id === conversationId,
      );
    if (hit) return normalizeDmConversation(hit);
  }

  for (const [, data] of queryClient.getQueriesData<DMConversation[]>({
    queryKey: ['dm-conversations'],
  })) {
    const hit = ensureArray<DMConversation>(data).find((c) => c.id === conversationId);
    if (hit) return normalizeDmConversation(hit);
  }

  return undefined;
}

/** Seed conversation-detail from inbox cache so the chat header paints instantly. */
export function seedConversationDetailCache(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
): void {
  if (!conversationId || !profileId) return;

  const detailKey = ['conversation-detail', profileId, conversationId] as const;
  const cached = findCachedDmConversation(queryClient, conversationId, profileId);
  if (cached) {
    queryClient.setQueryData(detailKey, normalizeDmConversation(cached));
    return;
  }

  const existing = queryClient.getQueryData<DMConversation>(detailKey);
  if (
    existing?.members?.length &&
    existing.members.some((m) => m.profile?.username)
  ) {
    return;
  }

  const seed = buildConversationPlaceholder(conversationId, profileId) as unknown as DMConversation;
  queryClient.setQueryData(detailKey, normalizeDmConversation(seed));
}

/** Prefetch thread + header before navigate — Snapchat-style tap-to-open. */
export function warmDmConversation(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
  actorId?: string | null,
): void {
  if (!conversationId) return;

  prewarmDmBroadcastChannel(conversationId);
  seedConversationDetailCache(queryClient, conversationId, profileId);

  if (readMessagesCache(queryClient, conversationId).length > 0) return;

  void queryClient.prefetchQuery({
    queryKey: messagesQueryKey(conversationId),
    queryFn: () => loadConversationMessages(queryClient, conversationId, actorId),
    staleTime: 120_000,
  });
}

export function warmDmConversationBatch(
  queryClient: QueryClient,
  conversationIds: string[],
  profileId?: string | null,
  actorId?: string | null,
): void {
  const unique = [...new Set(conversationIds.filter(Boolean))];
  unique.forEach((id, index) => {
    if (index < 6) {
      warmDmConversation(queryClient, id, profileId, actorId);
      return;
    }
    scheduleIdleWork(
      () => warmDmConversation(queryClient, id, profileId, actorId),
      150 + (index - 6) * 75,
    );
  });
}
