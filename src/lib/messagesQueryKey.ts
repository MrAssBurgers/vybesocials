import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import { ensureArray } from '@/lib/persistedCollections';

/** Ensure views/reactions survive React Query persistence (plain objects). */
export function normalizeMessageRow(msg: Message): Message {
  return {
    ...msg,
    views: ensureArray(msg.views),
    reactions: ensureArray(msg.reactions),
  };
}

export function safeMessageViews(msg: { views?: unknown }): NonNullable<Message['views']> {
  return ensureArray(msg.views);
}

export function safeMessageReactions(msg: { reactions?: unknown }): NonNullable<Message['reactions']> {
  return ensureArray(msg.reactions);
}

export function normalizeMessagesList(messages: unknown): Message[] {
  return ensureArray<Message>(messages).map(normalizeMessageRow);
}

export function normalizeMessagesCache(messages: unknown): Message[] {
  const arr = ensureArray<Message>(messages);
  if (!arr.length) return arr;
  const needsFix =
    !Array.isArray(messages) ||
    arr.some((m) => !Array.isArray(m?.views) || !Array.isArray(m?.reactions));
  return needsFix ? arr.map(normalizeMessageRow) : arr;
}

export function messagesQueryKey(conversationId: string | undefined) {
  return ['messages', conversationId] as const;
}

/** Append or replace an incoming message, dropping matching optimistic temps. */
export function appendIncomingMessage(
  old: Message[] | undefined,
  msg: Message,
): Message[] {
  if (!old?.length) return [msg];
  if (old.some((m) => m.id === msg.id)) return old;

  /** Drop only the newest matching optimistic temp for this sender+payload. */
  const withoutReplacedTemp = old.filter((m, idx, arr) => {
    if (typeof m.id !== 'string' || !m.id.startsWith('temp-')) return true;
    if (typeof msg.id === 'string' && msg.id.startsWith('temp-')) return true;
    if (m.sender_id !== msg.sender_id) return true;
    const sameContent =
      (m.content && msg.content && m.content === msg.content) ||
      (m.media_url && msg.media_url && m.media_url === msg.media_url);
    if (!sameContent) return true;
    // Remove only the last matching temp (most recent optimistic send).
    for (let i = arr.length - 1; i >= 0; i--) {
      const candidate = arr[i];
      if (
        typeof candidate.id === 'string' &&
        candidate.id.startsWith('temp-') &&
        candidate.sender_id === msg.sender_id &&
        ((candidate.content && msg.content && candidate.content === msg.content) ||
          (candidate.media_url && msg.media_url && candidate.media_url === msg.media_url))
      ) {
        return i !== idx;
      }
    }
    return true;
  });

  return [...withoutReplacedTemp, msg];
}

/** Stable list key — survives temp id → server id swap without remounting the bubble. */
export function messageRowKey(message: { id: string; _clientKey?: string }): string {
  return message._clientKey ?? message.id;
}

/** Replace a temp optimistic row with the confirmed server message. */
export function replaceOptimisticMessage(
  queryClient: QueryClient,
  conversationId: string,
  tempId: string,
  realMessage: Message,
): void {
  patchMessagesCache(queryClient, conversationId, (old) => {
    const tempRow = old?.find((m) => m.id === tempId);
    const realWithSender = realMessage.sender
      ? realMessage
      : tempRow?.sender
        ? { ...realMessage, sender: tempRow.sender }
        : realMessage;

    if (!old || old.length === 0) return [realWithSender];

    const realAlreadyPresent = old.some((m) => m.id === realWithSender.id);
    const tempPresent = old.some((m) => m.id === tempId);

    if (realAlreadyPresent) {
      const withoutTemp = tempPresent ? old.filter((m) => m.id !== tempId) : old;
      return withoutTemp.map((m) =>
        m.id === realWithSender.id
          ? {
              ...m,
              ...realWithSender,
              _clientKey: m._clientKey ?? tempId,
              sender: m.sender || realWithSender.sender,
            }
          : m,
      );
    }

    if (tempPresent) {
      return old.map((m) =>
        m.id === tempId ? { ...realWithSender, _clientKey: tempId } : m,
      );
    }

    return appendIncomingMessage(old, realWithSender);
  });
}

/** Patch the message list cache for this conversation. */
export function patchMessagesCache(
  queryClient: QueryClient,
  conversationId: string,
  patch: (old: Message[] | undefined) => Message[] | undefined,
): void {
  queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), patch);
}

export function readMessagesCache(queryClient: QueryClient, conversationId: string): Message[] {
  return normalizeMessagesCache(queryClient.getQueryData<Message[]>(messagesQueryKey(conversationId)));
}

/** Merge server fetch with optimistic temps + recently sent messages missing from fetch. */
export function mergeMessagesWithLocalCache(
  queryClient: QueryClient,
  conversationId: string,
  serverMessages: unknown,
): Message[] {
  const server = normalizeMessagesCache(serverMessages);
  const existing = readMessagesCache(queryClient, conversationId);
  const serverIds = new Set(server.map((m) => m.id));

  const localOnly = existing.filter((m) => {
    if (serverIds.has(m.id)) return false;
    if (typeof m.id === 'string' && m.id.startsWith('temp-')) return true;
    if ((m as { _failed?: boolean })._failed) return true;
    const age = Date.now() - new Date(m.created_at || 0).getTime();
    return age < 120_000;
  });

  if (!localOnly.length) return server;

  const merged = [...server];
  for (const m of localOnly) {
    if (!merged.some((x) => x.id === m.id)) merged.push(m);
  }
  merged.sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  );
  return normalizeMessagesCache(merged);
}

/** Write server rows into cache without dropping in-flight optimistic / failed sends. */
export function setMessagesCacheFromServer(
  queryClient: QueryClient,
  conversationId: string,
  serverMessages: Message[],
): void {
  queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), () =>
    mergeMessagesWithLocalCache(queryClient, conversationId, serverMessages),
  );
}
