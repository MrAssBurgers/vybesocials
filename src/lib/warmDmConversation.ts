import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import { prewarmDmBroadcastChannel } from '@/lib/dmBroadcast';
import {
  loadConversationMessages,
  MESSAGE_FETCH_TIMEOUT_MS,
  MESSAGE_SELECT_WARM,
} from '@/lib/loadConversationMessages';
import { readDmConversationsCache, type LoadedDMConversation } from '@/lib/loadDMConversations';
import { CHAT_INITIAL_MESSAGE_LIMIT } from '@/lib/conversationMessagesQuery';
import { messagesQueryKey, readMessagesCache, normalizeMessageRow } from '@/lib/messagesQueryKey';
import { normalizeDmConversation } from '@/lib/persistedCollections';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';
import { withTimeout } from '@/lib/withTimeout';
import { dmThreadLog } from '@/lib/dmThreadDebug';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { conversationDetailQueryKey, isDmConversationForViewer, isOwnedDmActor, ownedDmProfileId } from '@/lib/dmAccountScope';

type DMConversation = LoadedDMConversation;

const WARM_SKIP_THRESHOLD = 80;
const warmInflight = new Set<string>();

export function findCachedDmConversation(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
  session: ReportAccountSession = reportAccountSnapshot(),
): DMConversation | undefined {
  if (!conversationId || !session.uid) return undefined;
  return readDmConversationsCache(queryClient, profileId, session.uid, session).find(row => row.id === conversationId);
}

/** Seed conversation-detail from inbox cache so the chat header paints instantly. */
export function seedConversationDetailCache(
  queryClient: QueryClient,
  conversationId: string,
  profileId?: string | null,
  conversationHint?: DMConversation | null,
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  if (!conversationId || !session.uid) return;
  try { reportAccountGuard(session.uid)(); } catch { return; }
  const current = reportAccountSnapshot();
  if (current.epoch !== session.epoch) return;

  const detailKey = conversationDetailQueryKey(conversationId, session);
  const viewerId = ownedDmProfileId(session.uid) || session.uid;
  if (conversationHint?.id === conversationId && isDmConversationForViewer(conversationHint, viewerId, session.uid)) {
    queryClient.setQueryData(detailKey, normalizeDmConversation(conversationHint));
    return;
  }

  const cached = findCachedDmConversation(queryClient, conversationId, profileId, session);
  if (cached) {
    queryClient.setQueryData(detailKey, normalizeDmConversation(cached));
    return;
  }

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
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  if (!session.uid || reportAccountSnapshot().epoch !== session.epoch) return;
  if (readMessagesCache(queryClient, conversationId, session).length > 0) return;

  const viewerId = ownedDmProfileId(session.uid) || session.uid;
  const trustedHint = conversationHint && 'id' in conversationHint && conversationHint.id === conversationId
    && isDmConversationForViewer(conversationHint, viewerId, session.uid) ? conversationHint : undefined;
  const conv = trustedHint ?? findCachedDmConversation(queryClient, conversationId, profileId, session);
  const last = conv?.last_message;
  if (!last?.id || !last.created_at) return;

  if (last.conversation_id && last.conversation_id !== conversationId) return;
  queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId, session), [
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
  const session = reportAccountSnapshot();
  if (!session.uid || !isOwnedDmActor(actorId || profileId, session.uid)) return;
  const guard = reportAccountGuard(session.uid);
  try { guard(); } catch { return; }

  prewarmDmBroadcastChannel(conversationId);
  seedConversationDetailCache(queryClient, conversationId, profileId, conversationHint as DMConversation | null, session);
  seedMessagesFromInboxPreview(queryClient, conversationId, profileId, conversationHint, session);

  const resolvedActor = actorId ?? profileId;
  // Seed-only when profile isn't ready — don't block a later actor warm.
  if (!resolvedActor) return;

  if (readMessagesCache(queryClient, conversationId, session).length >= WARM_SKIP_THRESHOLD) return;
  const warmKey = JSON.stringify([session.uid, session.epoch, conversationId]);
  if (warmInflight.has(warmKey)) return;
  warmInflight.add(warmKey);

  const run = () => {
    try { guard(); } catch { warmInflight.delete(warmKey); return; }
    void withTimeout(
      queryClient.fetchQuery({
        queryKey: messagesQueryKey(conversationId, session),
        queryFn: async () => {
          guard();
          const data = await loadConversationMessages(queryClient, conversationId, resolvedActor, {
            recentOnly: true,
            maxMessages: CHAT_INITIAL_MESSAGE_LIMIT,
            select: MESSAGE_SELECT_WARM,
            session,
          });
          guard();
          return data;
        },
        staleTime: 0,
      }),
      MESSAGE_FETCH_TIMEOUT_MS,
      'warmDmConversation timed out',
    )
      .catch(() => {
        // Timed out — leave any in-flight ChatView fetch alone (cancelQueries kills it).
        dmThreadLog('warmTimedOut', conversationId);
      })
      .finally(() => {
        warmInflight.delete(warmKey);
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
  const session = reportAccountSnapshot();
  const guard = reportAccountGuard(session.uid || '');
  const unique = [...new Set(conversationIds.filter(Boolean))].slice(0, 8);
  unique.forEach((id, index) => {
    const hint = conversationHints?.get(id);
    // Always idle — inbox open must not race chat paint with 12 parallel fetches.
    scheduleIdleWork(
      () => { try { guard(); } catch { return; } warmDmConversation(queryClient, id, profileId, actorId, 'normal', hint); },
      200 + index * 120,
    );
  });
}
