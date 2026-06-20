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
