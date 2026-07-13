import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import { prewarmDmBroadcastChannel } from '@/lib/dmBroadcast';
import { loadConversationMessages, MESSAGE_SELECT_WARM } from '@/lib/loadConversationMessages';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { CHAT_INITIAL_MESSAGE_LIMIT } from '@/lib/conversationMessagesQuery';
import { messagesQueryKey, readMessagesCache, normalizeMessageRow } from '@/lib/messagesQueryKey';
import { buildConversationPlaceholder } from '@/lib/dmMembershipRepair';
import {
  ensureArray,
  findInQueryArray,
  normalizeDmConversation,
} from '@/lib/persistedCollections';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

type DMConversation = LoadedDMConversation;

const WARM_SKIP_THRESHOLD = 80;
const warmInflight = new Set<string>();

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
  conversationHint?: DMConversation | null,
): void {
  if (!conversationId) return;

  const detailKey = ['conversation-detail', conversationId] as const;
  if (conversationHint) {
    queryClient.setQueryData(detailKey, normalizeDmConversation(conversationHint));
    return;
  }

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

  if (!profileId) return;
  const seed = buildConversationPlaceholder(conversationId, profileId) as unknown as DMConversation;
  queryClient.setQueryData(detailKey, normalizeDmConversation(seed));
}

type InboxMessageSeed = {
  last_message?: {
    id?: string;
    created_at?: string;
    conversation_id?: string;
    sender_id?: string;
    content?: string | null;
    media_url?: string | null;
    message_type?: string;
    view_mode?: string;
    expires_at?: string | null;
    reply_to_id?: string | null;
  } | null;
};

/** Instant thread preview from inbox last_message — zero network before navigate. */
export function seedMessagesFromInboxPreview(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
  conversationHint?: InboxMessageSeed | null,
): void {
  if (readMessagesCache(queryClient, conversationId).length > 0) return;

  const conv =
    conversationHint ??
    findCachedDmConversation(queryClient, conversationId, profileId);
  const last = conv?.last_message;
  if (!last?.id || !last.created_at) return;

  queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), [
    normalizeMessageRow({
      ...last,
      conversation_id: conversationId,
      media_url: last.media_url ?? null,
      message_type: last.message_type ?? 'text',
      view_mode: last.view_mode ?? 'permanent',
      expires_at: last.expires_at ?? null,
      is_deleted: false,
      reply_to_id: last.reply_to_id ?? null,
      views: [],
      reactions: [],
    } as Message),
  ]);
}

/** Prefetch thread + header before navigate — Snapchat-style tap-to-open. */
export function warmDmConversation(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
  actorId?: string | null,
  priority: 'high' | 'normal' = 'normal',
  conversationHint?: InboxMessageSeed | DMConversation | null,
): void {
  if (!conversationId) return;

  prewarmDmBroadcastChannel(conversationId);
  seedConversationDetailCache(queryClient, conversationId, profileId, conversationHint as DMConversation | null);
  seedMessagesFromInboxPreview(queryClient, conversationId, profileId, conversationHint);

  const resolvedActor = actorId ?? profileId;
  // Seed-only when profile isn't ready — don't block a later actor warm.
  if (!resolvedActor) return;

  if (readMessagesCache(queryClient, conversationId).length >= WARM_SKIP_THRESHOLD) return;
  if (warmInflight.has(conversationId)) return;
  warmInflight.add(conversationId);

  const run = () => {
    void queryClient
      .fetchQuery({
        queryKey: messagesQueryKey(conversationId),
        queryFn: () =>
          loadConversationMessages(queryClient, conversationId, resolvedActor, {
            recentOnly: true,
            maxMessages: CHAT_INITIAL_MESSAGE_LIMIT,
            select: MESSAGE_SELECT_WARM,
          }),
        staleTime: 0,
      })
      .finally(() => {
        warmInflight.delete(conversationId);
      });
  };

  if (priority === 'high') {
    run();
    return;
  }

  scheduleIdleWork(run, 120);
}

export function warmDmConversationBatch(
  queryClient: QueryClient,
  conversationIds: string[],
  profileId?: string | null,
  actorId?: string | null,
  conversationHints?: Map<string, InboxMessageSeed>,
): void {
  const unique = [...new Set(conversationIds.filter(Boolean))].slice(0, 8);
  unique.forEach((id, index) => {
    const hint = conversationHints?.get(id);
    // Always idle — inbox open must not race chat paint with 12 parallel fetches.
    scheduleIdleWork(
      () => warmDmConversation(queryClient, id, profileId, actorId, 'normal', hint),
      200 + index * 120,
    );
  });
}
