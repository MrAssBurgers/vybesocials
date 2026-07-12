import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import type { Message } from '@/hooks/useMessages';

export type ChatSearchMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'vybe'
  | 'link'
  | 'file'
  | 'all';

export interface ChatSearchFilters {
  conversationId?: string;
  keyword?: string;
  senderId?: string;
  messageType?: ChatSearchMessageType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function matchesType(msg: Message, type: ChatSearchMessageType): boolean {
  if (type === 'all') return true;
  if (type === 'link') {
    return /https?:\/\//i.test(msg.content || '');
  }
  if (type === 'audio') {
    return msg.media_type === 'audio' || msg.media_type === 'voice';
  }
  if (type === 'image') {
    return msg.media_type === 'image' || msg.message_type === 'image';
  }
  if (type === 'video') {
    return msg.media_type === 'video' || msg.message_type === 'video';
  }
  if (type === 'vybe') {
    return msg.media_type === 'vybe' || msg.message_type === 'vybe';
  }
  if (type === 'file') {
    return msg.message_type === 'file';
  }
  return msg.message_type === 'text' || (!msg.media_url && !!msg.content);
}

export function useChatSearch(filters: ChatSearchFilters, enabled = true) {
  const limit = filters.limit ?? 50;

  return useQuery({
    queryKey: ['chat-search', filters],
    enabled: enabled && !!(filters.conversationId || filters.keyword),
    queryFn: async (): Promise<Message[]> => {
      const cid = filters.conversationId;
      if (!cid) return [];

      let query = db
        .from('messages')
        .select('*')
        .eq('conversation_id', cid)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (filters.senderId) {
        query = query.eq('sender_id', filters.senderId);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[useChatSearch] query failed', error);
        return [];
      }

      let rows = (data ?? []) as Message[];
      const kw = filters.keyword?.trim().toLowerCase();
      if (kw) {
        rows = rows.filter(
          (m) =>
            (m.content || '').toLowerCase().includes(kw) ||
            (m.media_type || '').toLowerCase().includes(kw),
        );
      }
      if (filters.messageType && filters.messageType !== 'all') {
        rows = rows.filter((m) => matchesType(m, filters.messageType!));
      }
      return rows;
    },
    staleTime: 10_000,
  });
}

export function useChatSearchSummary(filters: ChatSearchFilters) {
  const q = useChatSearch(filters);
  const summary = useMemo(
    () => ({
      count: q.data?.length ?? 0,
      hasKeyword: Boolean(filters.keyword?.trim()),
    }),
    [q.data?.length, filters.keyword],
  );
  return { ...q, summary };
}
