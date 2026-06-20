import { db } from '@/lib/firebase';
import type { VybeAuthError } from '@/lib/firebase/types';

type MessageRow = { created_at?: string; is_deleted?: boolean; conversation_id?: string };

function sortByCreatedDesc<T extends MessageRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

function isIndexError(error: VybeAuthError | null | undefined): boolean {
  return (
    error?.code === 'failed-precondition' &&
    /requires an index/i.test(String(error.message || ''))
  );
}

/** Latest messages for one conversation — avoids composite-index failures on prod. */
export async function fetchRecentConversationMessages<T extends MessageRow>(
  conversationId: string,
  select: string,
  limit = 50,
): Promise<{ data: T[] | null; error: VybeAuthError | null }> {
  const ordered = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!ordered.error) {
    return { data: (ordered.data || []) as T[], error: null };
  }

  if (!isIndexError(ordered.error)) {
    return { data: null, error: ordered.error };
  }

  const fallbackLimit = Math.max(limit * 5, 250);
  const plain = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .limit(fallbackLimit);

  if (plain.error) {
    return { data: null, error: plain.error };
  }

  const rows = sortByCreatedDesc((plain.data || []) as T[]).slice(0, limit);
  return { data: rows, error: null };
}

/** Batch last messages for many conversations — no orderBy (index-free). */
export async function fetchMessagesForConversations<T extends MessageRow>(
  conversationIds: string[],
  select: string,
  rowLimit: number,
): Promise<{ data: T[] | null; error: VybeAuthError | null }> {
  if (!conversationIds.length) return { data: [], error: null };

  const { data, error } = await db
    .from('messages')
    .select(select)
    .in('conversation_id', conversationIds)
    .limit(rowLimit);

  return { data: (data || []) as T[], error };
}
