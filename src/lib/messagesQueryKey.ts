import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';

/** TanStack Query key for a conversation's message list. */
export function messagesQueryKey(conversationId: string | undefined) {
  return ['messages', conversationId] as const;
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
