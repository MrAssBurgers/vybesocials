import { useCallback, useRef, useState, useEffect } from 'react';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { isMessageSessionCurrent } from '@/lib/messagesQueryKey';
import { useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import {
  CHAT_MAX_MESSAGE_HISTORY,
  CHAT_OLDER_MESSAGE_PAGE,
  fetchOlderConversationMessages,
} from '@/lib/conversationMessagesQuery';
import { MESSAGE_SELECT_SLIM } from '@/lib/loadConversationMessages';
import { conversationDetailQueryKey } from '@/lib/dmAccountScope';
import {
  messagesQueryKey,
  normalizeMessagesCache,
  readMessagesCache,
} from '@/lib/messagesQueryKey';

function isAccessDenial(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: unknown; name?: unknown; message?: unknown };
  return /permission[-_ ]denied|insufficient permissions|unauthenticated|missing.*permissions/i.test(`${failure.code || ''} ${failure.name || ''} ${failure.message || ''}`);
}

export function useOlderMessages(conversationId: string | undefined) {
  const session = useReportAccountSession();
  const queryClient = useQueryClient();
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const loadingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = useRef({ conversationId, session, generation: 0 });
  if (active.current.conversationId !== conversationId || active.current.session !== session) {
    active.current = { conversationId, session, generation: active.current.generation + 1 };
  }
  const generation = active.current.generation;
  const currentAction = () => mounted.current && isMessageSessionCurrent(session) && active.current.generation === generation;
  useEffect(() => { loadingRef.current = false; setIsLoadingOlder(false); setHasMoreOlder(true); }, [conversationId, session]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !session.uid || !currentAction() || loadingRef.current) return;
    const current = readMessagesCache(queryClient, conversationId, session);
    if (current.length >= CHAT_MAX_MESSAGE_HISTORY) {
      setHasMoreOlder(false);
      return;
    }
    const oldest = current[0];
    if (!oldest?.created_at) return;

    loadingRef.current = true;
    setIsLoadingOlder(true);
    const clearDeniedHistory = async () => {
      if (!currentAction()) return;
      const key = messagesQueryKey(conversationId, session);
      // Cancel an older authorized request before clearing, so its late result
      // cannot immediately refill text after a membership denial.
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (!currentAction()) return;
      queryClient.setQueryData<Message[]>(key, []);
      setHasMoreOlder(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key, exact: true }),
        queryClient.invalidateQueries({ queryKey: conversationDetailQueryKey(conversationId, session), exact: true }),
      ]);
    };
    try {
      const { data, error, hasMore } = await fetchOlderConversationMessages<Message>(
        conversationId,
        MESSAGE_SELECT_SLIM,
        oldest.created_at,
        CHAT_OLDER_MESSAGE_PAGE,
      );
      if (!currentAction()) return;
      if (isAccessDenial(error)) {
        await clearDeniedHistory();
        return;
      }
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

      queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId, session), (old) => {
        const base = normalizeMessagesCache(old ?? current);
        const ids = new Set(base.map((m) => m.id));
        const merged = [...prepend.filter((m) => !ids.has(m.id)), ...base];
        return merged;
      });

      const total = readMessagesCache(queryClient, conversationId, session).length;
      setHasMoreOlder(hasMore && total < CHAT_MAX_MESSAGE_HISTORY);
    } catch (error) {
      if (!currentAction()) return;
      if (isAccessDenial(error)) await clearDeniedHistory();
      else throw error;
    } finally {
      if (currentAction()) { loadingRef.current = false; setIsLoadingOlder(false); }
    }
  }, [conversationId, queryClient, session, generation]);

  const resetOlderState = useCallback(() => {
    setHasMoreOlder(true);
    loadingRef.current = false;
    setIsLoadingOlder(false);
  }, []);

  return { loadOlderMessages, isLoadingOlder, hasMoreOlder, resetOlderState };
}
