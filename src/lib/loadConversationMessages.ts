import type { QueryClient } from '@tanstack/react-query';
import type { Conversation, Message } from '@/hooks/useMessages';
import { fetchFullConversationMessageHistory, fetchRecentConversationMessages, CHAT_INITIAL_MESSAGE_LIMIT } from '@/lib/conversationMessagesQuery';
import {
  inferOtherParticipantId,
  isConversationMessagesReady,
  prepareConversationForMessages,
  fetchMemberProfiles,
} from '@/lib/dmMembershipRepair';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';
import { mergeMessagesWithLocalCache } from '@/lib/messagesQueryKey';
import { findInQueryArray, safeDmMembers, ensureArray } from '@/lib/persistedCollections';

export const MESSAGE_SELECT_SLIM = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name),
  views:message_views(user_id, viewed_at),
  reactions:message_reactions(user_id, emoji)
`;

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

/** Shared fetch for useMessages + chat prefetch — one code path, warm cache before navigate. */
export async function loadConversationMessages(
  queryClient: QueryClient,
  conversationId: string,
  actorId?: string | null,
  options?: { maxMessages?: number },
): Promise<Message[]> {
  const maxMessages = options?.maxMessages ?? CHAT_INITIAL_MESSAGE_LIMIT * 12;
  const resolvedActorId =
    syncSessionProfileId(actorId) ??
    (await resolveSessionProfileId(actorId)) ??
    actorId;

  if (!resolvedActorId) return [];

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

  let { data, error } = await fetchFullConversationMessageHistory<Message>(
    conversationId,
    MESSAGE_SELECT_SLIM,
    maxMessages,
  );

  if (error) {
    await prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast: true,
    });
    const retryPlain = await fetchFullConversationMessageHistory<Message>(
      conversationId,
      '*',
      maxMessages,
    );
    if (!retryPlain.error) {
      data = retryPlain.data;
      error = retryPlain.error;
    } else {
      const retryRecent = await fetchRecentConversationMessages<Message>(
        conversationId,
        'id, conversation_id, sender_id, content, media_url, media_type, view_mode, expires_at, created_at, is_deleted, reply_to_id',
        CHAT_INITIAL_MESSAGE_LIMIT,
      );
      if (!retryRecent.error) {
        data = sortChronological((retryRecent.data || []) as Message[]);
        error = retryRecent.error;
      }
    }
  } else if (!isConversationMessagesReady(conversationId, resolvedActorId)) {
    void prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast: true,
    }).catch(() => {});
  }

  if (!error && (!data || data.length === 0)) {
    await prepareConversationForMessages(conversationId, resolvedActorId, otherProfileId, {
      fast: false,
    });
    const retryEmpty = await fetchFullConversationMessageHistory<Message>(
      conversationId,
      MESSAGE_SELECT_SLIM,
      maxMessages,
    );
    if (!retryEmpty.error && retryEmpty.data?.length) {
      data = retryEmpty.data;
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
