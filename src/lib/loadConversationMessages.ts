import type { QueryClient } from '@tanstack/react-query';
import type { Conversation, Message } from '@/hooks/useMessages';
import { fetchFullConversationMessageHistory, fetchRecentConversationMessages, CHAT_INITIAL_MESSAGE_LIMIT, CHAT_MAX_MESSAGE_HISTORY } from '@/lib/conversationMessagesQuery';
import {
  inferOtherParticipantId,
  isConversationMessagesReady,
  prepareConversationForMessages,
  fetchMemberProfiles,
} from '@/lib/dmMembershipRepair';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';
import { mergeMessagesWithLocalCache, readMessagesCache } from '@/lib/messagesQueryKey';
import { findInQueryArray, safeDmMembers, ensureArray } from '@/lib/persistedCollections';
import { withTimeout } from '@/lib/withTimeout';

export const MESSAGE_SELECT_SLIM = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name),
  views:message_views(user_id, viewed_at),
  reactions:message_reactions(user_id, emoji)
`;

/** Lighter select for instant open / prefetch — views load on background hydrate. */
export const MESSAGE_SELECT_WARM = `
  id, conversation_id, sender_id, content, media_url, media_type, message_type,
  view_mode, expires_at, is_deleted, reply_to_id, created_at, edited_at, viewed_at,
  saved_by_sender, saved_by_recipient, vybe_replay_exhausted,
  sender:profiles!sender_id(id, username, avatar_url, display_name)
`;

/** Index-free fallback when joins or enriched selects fail. */
export const MESSAGE_SELECT_MINIMAL = `
  id, conversation_id, sender_id, content, media_url, media_type, message_type,
  view_mode, expires_at, is_deleted, reply_to_id, created_at, edited_at, viewed_at,
  saved_by_sender, saved_by_recipient, vybe_replay_exhausted
`;

export type LoadConversationMessagesOptions = {
  maxMessages?: number;
  /** Single round trip — instant thread paint. Default true. */
  recentOnly?: boolean;
  select?: string;
};

const REPAIR_TIMEOUT_MS = 3000;
/** Hard cap so a hung getDocs/network never leaves useMessages pending forever. */
export const MESSAGE_FETCH_TIMEOUT_MS = 6000;
/** Profile enrich is nice-to-have — paint without sender usernames if it stalls. */
export const MESSAGE_ENRICH_TIMEOUT_MS = 3000;

type FetchResult = { data: Message[] | null; error: unknown };

function enrichMessagesWithSenders(
  messages: Message[],
  profileByKey: Map<string, Record<string, unknown>>,
): Message[] {
  if (!messages.length || !profileByKey.size) return messages;
  return messages.map((msg) => {
    if (msg.sender?.username) return msg;
    const profile = profileByKey.get(msg.sender_id);
    if (!profile) return msg;
    return {
      ...msg,
      sender: {
        id: String(profile.id || msg.sender_id),
        username: String(profile.username || ''),
        avatar_url: (profile.avatar_url as string | null) ?? null,
        display_name: (profile.display_name as string | null) ?? null,
      },
    };
  });
}

async function enrichMessagesFromProfiles(messages: Message[]): Promise<Message[]> {
  const needsEnrich = messages.some((m) => m.sender_id && !m.sender?.username);
  if (!needsEnrich) return messages;

  const senderIds = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))];
  if (!senderIds.length) return messages;
  try {
    const profileByKey = await withTimeout(
      fetchMemberProfiles(senderIds),
      MESSAGE_ENRICH_TIMEOUT_MS,
      'enrichMessagesFromProfiles timed out',
    );
    return enrichMessagesWithSenders(messages, profileByKey);
  } catch {
    return messages;
  }
}

async function fetchRecentTimed(
  conversationId: string,
  select: string,
  maxMessages: number,
): Promise<FetchResult> {
  try {
    return await withTimeout(
      fetchRecentConversationMessages<Message>(conversationId, select, maxMessages),
      MESSAGE_FETCH_TIMEOUT_MS,
      'fetchRecentConversationMessages timed out',
    );
  } catch (error) {
    return { data: null, error };
  }
}

async function fetchFullTimed(
  conversationId: string,
  select: string,
  maxMessages: number,
): Promise<FetchResult> {
  try {
    return await withTimeout(
      fetchFullConversationMessageHistory<Message>(conversationId, select, maxMessages),
      MESSAGE_FETCH_TIMEOUT_MS,
      'fetchFullConversationMessageHistory timed out',
    );
  } catch (error) {
    return { data: null, error };
  }
}

/** Prefer seed/cache when network hangs; throw only when there is nothing to paint. */
function settleOrThrowSeed(
  queryClient: QueryClient,
  conversationId: string,
  error: unknown,
): Message[] {
  const existing = readMessagesCache(queryClient, conversationId);
  if (existing.length) {
    return mergeMessagesWithLocalCache(queryClient, conversationId, existing);
  }
  throw error instanceof Error ? error : new Error(String(error ?? 'Message fetch failed'));
}

function filterMessagesForViewer(messages: Message[], viewerId?: string): Message[] {
  return messages.filter((msg) => {
    if (msg.view_mode === 'view_once' && msg.media_type !== 'vybe' && msg.sender_id !== viewerId) {
      const hasViewed = ensureArray(msg.views).some((v) => v.user_id === viewerId);
      if (hasViewed) return false;
    }
    if (msg.expires_at && new Date(msg.expires_at) < new Date()) {
      return false;
    }
    return true;
  });
}

async function repairWithTimeout(
  conversationId: string,
  resolvedActorId: string,
  otherProfileId: string | null,
): Promise<void> {
  try {
    await withTimeout(
      prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
        fast: true,
      }),
      REPAIR_TIMEOUT_MS,
      'Membership repair timed out',
    );
  } catch {
    /* never block open forever */
  }
}

/** Shared fetch for useMessages + chat prefetch — fast recent first, full history in background. */
export async function loadConversationMessages(
  queryClient: QueryClient,
  conversationId: string,
  actorId?: string | null,
  options?: LoadConversationMessagesOptions,
): Promise<Message[]> {
  const recentOnly = options?.recentOnly ?? true;
  const maxMessages =
    options?.maxMessages ??
    (recentOnly ? CHAT_INITIAL_MESSAGE_LIMIT : CHAT_MAX_MESSAGE_HISTORY);
  const select =
    options?.select ?? (recentOnly ? MESSAGE_SELECT_WARM : MESSAGE_SELECT_SLIM);
  const resolvedActorId =
    syncSessionProfileId(actorId) ??
    actorId ??
    (await resolveSessionProfileId(actorId));

  if (!resolvedActorId) {
    // Never wipe an inbox/open seed when profile isn't ready yet.
    const existing = readMessagesCache(queryClient, conversationId);
    if (existing.length) return existing;
    return [];
  }

  const cachedConv =
    findInQueryArray(
      queryClient.getQueryData<Conversation[]>(['dm-conversations', resolvedActorId]),
      (c) => c.id === conversationId,
    ) ??
    findInQueryArray(
      queryClient.getQueryData<Conversation[]>(['conversations', resolvedActorId]),
      (c) => c.id === conversationId,
    );
  const otherFromMembers =
    safeDmMembers(cachedConv?.members).find(
      (m) => m.user_id !== resolvedActorId && m.profile?.id !== resolvedActorId,
    )?.profile?.id ??
    safeDmMembers(cachedConv?.members).find((m) => m.user_id !== resolvedActorId)?.user_id;
  const otherProfileId =
    otherFromMembers || inferOtherParticipantId(conversationId, resolvedActorId) || null;

  const runRepairBackground = () => {
    void prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast: true,
    }).catch(() => {});
  };

  if (recentOnly) {
    let { data, error } = await fetchRecentTimed(conversationId, select, maxMessages);

    if (error) {
      await repairWithTimeout(conversationId, resolvedActorId, otherProfileId);
      const retry = await fetchRecentTimed(conversationId, MESSAGE_SELECT_MINIMAL, maxMessages);
      data = retry.data;
      error = retry.error;
    } else if (data?.length) {
      // Paint immediately — repair membership in background if needed.
      if (!isConversationMessagesReady(conversationId, resolvedActorId)) {
        runRepairBackground();
      }
    } else {
      // Empty thread: timed repair + one retry (never hang forever).
      await repairWithTimeout(conversationId, resolvedActorId, otherProfileId);
      const retry = await fetchRecentTimed(conversationId, MESSAGE_SELECT_MINIMAL, maxMessages);
      if (!retry.error && retry.data?.length) {
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) return settleOrThrowSeed(queryClient, conversationId, error);

    const rows = ((data || []) as Message[]).filter((m) => !m.is_deleted);
    const filtered = filterMessagesForViewer(rows, resolvedActorId);
    const enriched = await enrichMessagesFromProfiles(filtered);
    return mergeMessagesWithLocalCache(queryClient, conversationId, sortChronological(enriched));
  }

  let { data, error } = await fetchFullTimed(conversationId, select, maxMessages);

  if (error) {
    await repairWithTimeout(conversationId, resolvedActorId, otherProfileId);
    const retryPlain = await fetchFullTimed(conversationId, MESSAGE_SELECT_SLIM, maxMessages);
    if (!retryPlain.error) {
      data = retryPlain.data;
      error = retryPlain.error;
    } else {
      const retryRecent = await fetchRecentTimed(
        conversationId,
        MESSAGE_SELECT_WARM,
        CHAT_INITIAL_MESSAGE_LIMIT,
      );
      if (!retryRecent.error) {
        data = sortChronological((retryRecent.data || []) as Message[]);
        error = retryRecent.error;
      }
    }
  } else if (data?.length) {
    if (!isConversationMessagesReady(conversationId, resolvedActorId)) {
      runRepairBackground();
    }
  } else {
    await repairWithTimeout(conversationId, resolvedActorId, otherProfileId);
    const retryEmpty = await fetchRecentTimed(
      conversationId,
      MESSAGE_SELECT_WARM,
      CHAT_INITIAL_MESSAGE_LIMIT,
    );
    if (!retryEmpty.error && retryEmpty.data?.length) {
      data = sortChronological(retryEmpty.data as Message[]);
    }
  }

  if (error) return settleOrThrowSeed(queryClient, conversationId, error);

  const rows = ((data || []) as Message[]).filter((m) => !m.is_deleted);

  const filtered = filterMessagesForViewer(rows, resolvedActorId);
  const enriched = await enrichMessagesFromProfiles(filtered);
  return mergeMessagesWithLocalCache(queryClient, conversationId, enriched);
}

function sortChronological(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  );
}
