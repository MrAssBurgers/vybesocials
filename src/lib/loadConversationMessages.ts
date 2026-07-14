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
  const profileByKey = await fetchMemberProfiles(senderIds);
  return enrichMessagesWithSenders(messages, profileByKey);
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
    (await resolveSessionProfileId(actorId)) ??
    actorId;

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

  const runRepair = (fast: boolean) => {
    void prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast,
    }).catch(() => {});
  };

  if (recentOnly) {
    let { data, error } = await fetchRecentConversationMessages<Message>(
      conversationId,
      select,
      maxMessages,
    );

    if (error) {
      await prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
        fast: true,
      });
      const retry = await fetchRecentConversationMessages<Message>(
        conversationId,
        MESSAGE_SELECT_MINIMAL,
        maxMessages,
      );
      data = retry.data;
      error = retry.error;
    } else if (!data?.length || !isConversationMessagesReady(conversationId, resolvedActorId)) {
      // Await membership repair then retry — fire-and-forget left threads empty forever.
      await prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
        fast: true,
      });
      const retry = await fetchRecentConversationMessages<Message>(
        conversationId,
        MESSAGE_SELECT_MINIMAL,
        maxMessages,
      );
      if (!retry.error && retry.data?.length) {
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) throw error;

    const rows = ((data || []) as Message[]).filter((m) => !m.is_deleted);
    const filtered = filterMessagesForViewer(rows, resolvedActorId);
    const enriched = await enrichMessagesFromProfiles(filtered);
    return mergeMessagesWithLocalCache(queryClient, conversationId, sortChronological(enriched));
  }

  let { data, error } = await fetchFullConversationMessageHistory<Message>(
    conversationId,
    select,
    maxMessages,
  );

  if (error) {
    await prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast: true,
    });
    const retryPlain = await fetchFullConversationMessageHistory<Message>(
      conversationId,
      MESSAGE_SELECT_SLIM,
      maxMessages,
    );
    if (!retryPlain.error) {
      data = retryPlain.data;
      error = retryPlain.error;
    } else {
      const retryRecent = await fetchRecentConversationMessages<Message>(
        conversationId,
        MESSAGE_SELECT_WARM,
        CHAT_INITIAL_MESSAGE_LIMIT,
      );
      if (!retryRecent.error) {
        data = sortChronological((retryRecent.data || []) as Message[]);
        error = retryRecent.error;
      }
    }
  } else if (!isConversationMessagesReady(conversationId, resolvedActorId)) {
    runRepair(true);
  }

  if (!error && (!data || data.length === 0)) {
    runRepair(true);
    const retryEmpty = await fetchRecentConversationMessages<Message>(
      conversationId,
      MESSAGE_SELECT_WARM,
      CHAT_INITIAL_MESSAGE_LIMIT,
    );
    if (!retryEmpty.error && retryEmpty.data?.length) {
      data = sortChronological(retryEmpty.data as Message[]);
    }
  }

  if (error) throw error;

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
