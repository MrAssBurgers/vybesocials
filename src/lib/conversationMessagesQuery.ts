import { db } from '@/lib/firebase';
import type { VybeAuthError } from '@/lib/firebase/types';

type MessageRow = { id?: string; created_at?: string; is_deleted?: boolean; conversation_id?: string };

/** Initial thread paint — newest page only; older messages load on scroll. */
export const CHAT_INITIAL_MESSAGE_LIMIT = 50;
/** Older pages when scrolling up or completing history. */
export const CHAT_OLDER_MESSAGE_PAGE = 150;
/** Hard cap — history loads page-by-page on scroll, so this just bounds cache size. */
export const CHAT_MAX_MESSAGE_HISTORY = 10000;

function isAccessDenial(error: VybeAuthError): boolean {
  return /permission|unauthenticated|denied/i.test(`${error.code || ''} ${error.message || ''}`);
}

function sortByCreatedDesc<T extends MessageRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

function sortByCreatedAsc<T extends MessageRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  );
}

function dedupeById<T extends MessageRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row.id || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Latest messages for one conversation.
 * Server-ordered page (uses the conversation_id + created_at composite index)
 * with an index-free client-sort fallback.
 */
export async function fetchRecentConversationMessages<T extends MessageRow>(
  conversationId: string,
  select: string,
  limit = CHAT_INITIAL_MESSAGE_LIMIT,
): Promise<{ data: T[] | null; error: VybeAuthError | null }> {
  const ordered = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!ordered.error) {
    return { data: sortByCreatedDesc((ordered.data || []) as T[]), error: null };
  }
  if (isAccessDenial(ordered.error)) return { data: null, error: ordered.error };

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

/** Messages strictly older than `beforeCreatedAt` (for scroll-up pagination). */
export async function fetchOlderConversationMessages<T extends MessageRow>(
  conversationId: string,
  select: string,
  beforeCreatedAt: string,
  limit = CHAT_OLDER_MESSAGE_PAGE,
): Promise<{ data: T[] | null; error: VybeAuthError | null; hasMore: boolean }> {
  const beforeTs = new Date(beforeCreatedAt).getTime();
  if (!Number.isFinite(beforeTs)) {
    return { data: [], error: null, hasMore: false };
  }

  // Exact server-ordered page — one extra row tells us if more history exists.
  const ordered = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (!ordered.error) {
    const rows = sortByCreatedDesc((ordered.data || []) as T[]);
    const hasMore = rows.length > limit;
    return { data: rows.slice(0, limit), error: null, hasMore };
  }
  if (isAccessDenial(ordered.error)) return { data: null, error: ordered.error, hasMore: false };

  // Fallback: index-free scan + client filter (misses history past the scan cap).
  const fetchLimit = Math.max(limit * 8, 400);
  const { data, error } = await db
    .from('messages')
    .select(select)
    .eq('conversation_id', conversationId)
    .limit(fetchLimit);

  if (error) {
    return { data: null, error, hasMore: false };
  }

  const candidates = sortByCreatedDesc((data || []) as T[]).filter(
    (row) => new Date(row.created_at || 0).getTime() < beforeTs,
  );
  const rows = candidates.slice(0, limit);
  const hasMore = candidates.length > limit;
  return { data: rows, error: null, hasMore };
}

/** Walk backward through history until exhausted or cap reached. */
export async function fetchFullConversationMessageHistory<T extends MessageRow>(
  conversationId: string,
  select: string,
  maxMessages = CHAT_MAX_MESSAGE_HISTORY,
): Promise<{ data: T[]; error: VybeAuthError | null; hasMore: boolean }> {
  const first = await fetchRecentConversationMessages<T>(
    conversationId,
    select,
    CHAT_INITIAL_MESSAGE_LIMIT,
  );
  if (first.error) {
    return { data: [], error: first.error, hasMore: false };
  }

  let collected = dedupeById((first.data || []) as T[]);
  let hasMore = false;

  while (collected.length < maxMessages) {
    const oldest = sortByCreatedAsc(collected)[0];
    if (!oldest?.created_at) break;

    const older = await fetchOlderConversationMessages<T>(
      conversationId,
      select,
      oldest.created_at,
      CHAT_OLDER_MESSAGE_PAGE,
    );
    if (older.error) {
      return { data: sortByCreatedAsc(collected), error: older.error, hasMore: false };
    }
    if (!older.data?.length) break;

    hasMore = older.hasMore || collected.length + older.data.length >= maxMessages;
    const existingIds = new Set(collected.map((m) => String(m.id || '')));
    const newRows = older.data.filter((m) => m.id && !existingIds.has(String(m.id)));
    if (!newRows.length) break;
    collected = dedupeById([...collected, ...newRows]);
    if (!older.hasMore) break;
  }

  return { data: sortByCreatedAsc(collected), error: null, hasMore };
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
