import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import {
  CHAT_MAX_MESSAGE_HISTORY,
  CHAT_OLDER_MESSAGE_PAGE,
  fetchOlderConversationMessages,
} from '@/lib/conversationMessagesQuery';
import { MESSAGE_SELECT_SLIM } from '@/lib/loadConversationMessages';
import {
  messagesQueryKey,
  normalizeMessagesCache,
  readMessagesCache,
} from '@/lib/messagesQueryKey';

export function useOlderMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const loadingRef = useRef(false);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingRef.current) return;
    const current = readMessagesCache(queryClient, conversationId);
    if (current.length >= CHAT_MAX_MESSAGE_HISTORY) {
      setHasMoreOlder(false);
      return;
    }
    const oldest = current[0];
    if (!oldest?.created_at) return;

    loadingRef.current = true;
    setIsLoadingOlder(true);
    try {
      const { data, error, hasMore } = await fetchOlderConversationMessages<Message>(
        conversationId,
        MESSAGE_SELECT_SLIM,
        oldest.created_at,
        CHAT_OLDER_MESSAGE_PAGE,
      );
      if (error || !data?.length) {
        setHasMoreOlder(false);
        return;
      }

      const existingIds = new Set(current.map((m) => m.id));
      const prepend = data
        .filter((m) => !m.is_deleted && !existingIds.has(m.id))
        .reverse();

      if (!prepend.length) {
        setHasMoreOlder(false);
        return;
      }

      queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), (old) => {
        const base = normalizeMessagesCache(old ?? current);
        const ids = new Set(base.map((m) => m.id));
        const merged = [...prepend.filter((m) => !ids.has(m.id)), ...base];
        return merged;
      });

      const total = readMessagesCache(queryClient, conversationId).length;
      setHasMoreOlder(hasMore && total < CHAT_MAX_MESSAGE_HISTORY);
    } finally {
      loadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [conversationId, queryClient]);

  const resetOlderState = useCallback(() => {
    setHasMoreOlder(true);
    loadingRef.current = false;
    setIsLoadingOlder(false);
  }, []);

  return { loadOlderMessages, isLoadingOlder, hasMoreOlder, resetOlderState };
}
