import { db } from '@/lib/firebase';
import type { VybeAuthError } from '@/lib/firebase/types';

type MessageRow = { created_at?: string; is_deleted?: boolean; conversation_id?: string };

function sortByCreatedDesc<T extends MessageRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

/** Latest messages for one conversation — index-free Firestore query + client sort. */
export async function fetchRecentConversationMessages<T extends MessageRow>(
  conversationId: string,
  select: string,
  limit = 50,
): Promise<{ data: T[] | null; error: VybeAuthError | null }> {
  const fetchLimit = Math.max(limit * 5, 250);
  const { data, error } = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .limit(fetchLimit);

  if (error) {
    return { data: null, error };
  }

  const rows = sortByCreatedDesc((data || []) as T[]).slice(0, limit);
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

  const rows = sortByCreatedDesc((data || []) as T[]);
  return { data: rows, error };
}

const LATEST_MSG_SELECT =
  'id, conversation_id, sender_id, content, media_type, viewed_at, created_at, is_deleted, message_type';

/** One latest non-deleted message per conversation (reliable inbox previews). */
export async function fetchLatestMessagePerConversation<T extends MessageRow>(
  conversationIds: string[],
): Promise<{ data: T[]; error: VybeAuthError | null }> {
  if (!conversationIds.length) return { data: [], error: null };

  const BATCH = 10;
  const latest: T[] = [];

  for (let i = 0; i < conversationIds.length; i += BATCH) {
    const chunk = conversationIds.slice(i, i + BATCH);
    const chunkResults = await Promise.all(
      chunk.map((conversationId) =>
        fetchRecentConversationMessages<T>(conversationId, LATEST_MSG_SELECT, 1),
      ),
    );
    for (const result of chunkResults) {
      if (result.error) return { data: latest, error: result.error };
      const row = result.data?.find((msg) => !msg.is_deleted);
      if (row) latest.push(row);
    }
  }

  return { data: latest, error: null };
}
