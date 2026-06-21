import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';

/** TanStack Query key for a conversation's message list. */
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

  const withoutReplacedTemp = old.filter((m) => {
    if (typeof m.id !== 'string' || !m.id.startsWith('temp-')) return true;
    if (typeof msg.id === 'string' && msg.id.startsWith('temp-')) return true;
    if (m.sender_id !== msg.sender_id) return true;
    const sameContent =
      (m.content && msg.content && m.content === msg.content) ||
      (m.media_url && msg.media_url && m.media_url === msg.media_url);
    return !sameContent;
  });

  return [...withoutReplacedTemp, msg];
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
          ? { ...m, ...realWithSender, sender: m.sender || realWithSender.sender }
          : m,
      );
    }

    if (tempPresent) {
      return old.map((m) => (m.id === tempId ? realWithSender : m));
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
  return queryClient.getQueryData<Message[]>(messagesQueryKey(conversationId)) || [];
}

/** Merge server fetch with optimistic temps + recently sent messages missing from fetch. */
export function mergeMessagesWithLocalCache(
  queryClient: QueryClient,
  conversationId: string,
  serverMessages: Message[],
): Message[] {
  const existing = readMessagesCache(queryClient, conversationId);
  const serverIds = new Set(serverMessages.map((m) => m.id));

  const localOnly = existing.filter((m) => {
    if (serverIds.has(m.id)) return false;
    if (typeof m.id === 'string' && m.id.startsWith('temp-')) return true;
    if ((m as { _failed?: boolean })._failed) return true;
    const age = Date.now() - new Date(m.created_at || 0).getTime();
    return age < 120_000;
  });

  if (!localOnly.length) return serverMessages;

  const merged = [...serverMessages];
  for (const m of localOnly) {
    if (!merged.some((x) => x.id === m.id)) merged.push(m);
  }
  merged.sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  );
  return merged;
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
