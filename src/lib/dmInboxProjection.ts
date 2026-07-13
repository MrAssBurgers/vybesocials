import {
  collectionRef,
  firestoreLimit,
  getDocuments,
  onSnapshot,
  orderBy,
  query,
  where,
} from '@/lib/firebase/firestoreDb';
import type { Unsubscribe } from 'firebase/firestore';
import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

const COLLECTION = 'dm_inbox_entries';

export function inboxEntryDocId(viewerId: string, conversationId: string): string {
  return `${viewerId}_${conversationId}`;
}

export function mapInboxEntryDoc(
  id: string,
  data: Record<string, unknown>,
): DmInboxEntryDoc {
  return {
    viewer_id: String(data.viewer_id || ''),
    conversation_id: String(data.conversation_id || id),
    conversation_type: data.conversation_type === 'group' ? 'group' : 'direct',
    display_name: String(data.display_name || 'Chat'),
    username: (data.username as string | null | undefined) ?? null,
    avatar_url: (data.avatar_url as string | null | undefined) ?? null,
    secondary_avatar_url: (data.secondary_avatar_url as string | null | undefined) ?? null,
    other_profile_id: (data.other_profile_id as string | null | undefined) ?? null,
    member_ids: Array.isArray(data.member_ids)
      ? data.member_ids.filter((x): x is string => typeof x === 'string')
      : [],
    preview_text: String(data.preview_text || ''),
    latest_message_id: (data.latest_message_id as string | null | undefined) ?? null,
    latest_message_type: String(data.latest_message_type || 'text'),
    latest_sender_id: (data.latest_sender_id as string | null | undefined) ?? null,
    latest_sender_name: (data.latest_sender_name as string | null | undefined) ?? null,
    latest_message_at: (data.latest_message_at as string | null | undefined) ?? null,
    delivery_status: String(data.delivery_status || ''),
    unread_count: Number(data.unread_count) || 0,
    mention_count: Number(data.mention_count) || 0,
    is_unread: Boolean(data.is_unread),
    is_pinned: Boolean(data.is_pinned),
    pin_order: Number(data.pin_order) || 0,
    is_muted: Boolean(data.is_muted),
    is_archived: Boolean(data.is_archived),
    needs_reply: Boolean(data.needs_reply),
    streak_count: Number(data.streak_count) || 0,
    relationship_badge:
      data.relationship_badge === 'close_friend' || data.relationship_badge === 'new_friend'
        ? data.relationship_badge
        : null,
    primary_relationship_state:
      (data.primary_relationship_state as DmInboxEntryDoc['primary_relationship_state']) ?? null,
    best_friend_rank:
      typeof data.best_friend_rank === 'number' ? data.best_friend_rank : null,
    relationship_title: (data.relationship_title as string | null | undefined) ?? null,
    streak_state: (data.streak_state as DmInboxEntryDoc['streak_state']) ?? null,
    birthday_state: (data.birthday_state as DmInboxEntryDoc['birthday_state']) ?? null,
    favorite_state: (data.favorite_state as DmInboxEntryDoc['favorite_state']) ?? null,
    relationship_updated_at: (data.relationship_updated_at as string | undefined) || undefined,
    is_verified: Boolean(data.is_verified),
    search_tokens: Array.isArray(data.search_tokens)
      ? data.search_tokens.filter((x): x is string => typeof x === 'string')
      : [],
    updated_at: (data.updated_at as string | undefined) || undefined,
    projection_version: Number(data.projection_version) || 0,
  };
}

/** One-shot viewer-scoped projection query (non-archived first). */
export async function loadDmInboxProjection(
  viewerId: string,
  max = 200,
): Promise<DmInboxEntryDoc[]> {
  if (!viewerId) return [];
  try {
    const rows = await getDocuments<Record<string, unknown>>(COLLECTION, [
      where('viewer_id', '==', viewerId),
      where('is_archived', '==', false),
      orderBy('latest_message_at', 'desc'),
      firestoreLimit(max),
    ]);
    return rows.map((row) => mapInboxEntryDoc(String(row.id), row));
  } catch (err) {
    console.warn('[dm_inbox_entries] archived filter query failed, falling back', err);
    const rows = await getDocuments<Record<string, unknown>>(COLLECTION, [
      where('viewer_id', '==', viewerId),
      orderBy('latest_message_at', 'desc'),
      firestoreLimit(max),
    ]);
    return rows
      .map((row) => mapInboxEntryDoc(String(row.id), row))
      .filter((row) => !row.is_archived);
  }
}

/**
 * Normalize a raw search string into the lowercase prefix token used by the
 * server-generated `search_tokens` array (see `buildSearchTokens` in
 * `functions/src/dmInboxProjection.ts`). Tokens are prefixes up to 12 chars,
 * so a 12+ char query is clipped to match what the projection indexed.
 */
export function normalizeDmSearchToken(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_\s.@-]/g, ' ')
    .trim();
  if (!normalized) return '';
  const [firstWord] = normalized.split(/\s+/);
  return (firstWord || normalized).slice(0, 12);
}

/**
 * Server-side conversation/group search via `search_tokens` array-contains —
 * avoids loading every conversation just to filter client-side. Requires the
 * `viewer_id ASC, search_tokens CONTAINS, latest_message_at DESC` composite
 * index (already provisioned in firestore.indexes.json). Callers should fall
 * back to filtering already-loaded inbox rows when this throws or returns
 * an empty list (e.g. index still building, or query too short to tokenize).
 */
export async function searchDmInboxEntriesByToken(
  viewerId: string,
  rawQuery: string,
  max = 20,
): Promise<DmInboxEntryDoc[]> {
  const token = normalizeDmSearchToken(rawQuery);
  if (!viewerId || !token) return [];
  const rows = await getDocuments<Record<string, unknown>>(COLLECTION, [
    where('viewer_id', '==', viewerId),
    where('search_tokens', 'array-contains', token),
    orderBy('latest_message_at', 'desc'),
    firestoreLimit(max),
  ]);
  return rows
    .map((row) => mapInboxEntryDoc(String(row.id), row))
    .filter((row) => !row.is_archived);
}

export function subscribeDmInboxProjection(
  viewerId: string,
  onData: (entries: DmInboxEntryDoc[]) => void,
  onError?: (err: Error) => void,
  max = 200,
): Unsubscribe {
  const q = query(
    collectionRef(COLLECTION),
    where('viewer_id', '==', viewerId),
    orderBy('latest_message_at', 'desc'),
    firestoreLimit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs
        .map((docSnap) => mapInboxEntryDoc(docSnap.id, docSnap.data() as Record<string, unknown>))
        .filter((row) => !row.is_archived);
      onData(entries);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

/** Convert projection row into a LoadedDMConversation-compatible stub for UI reuse. */
export function projectionToLoadedConversation(
  entry: DmInboxEntryDoc,
): LoadedDMConversation {
  const lastMessage = entry.latest_message_id
    ? {
        id: entry.latest_message_id,
        conversation_id: entry.conversation_id,
        sender_id: entry.latest_sender_id || '',
        content: entry.preview_text,
        created_at: entry.latest_message_at || new Date().toISOString(),
        message_type: entry.latest_message_type || 'text',
      }
    : null;

  return {
    id: entry.conversation_id,
    is_group: entry.conversation_type === 'group',
    name: entry.display_name,
    updated_at: entry.latest_message_at || entry.updated_at || new Date().toISOString(),
    unread_count: entry.unread_count,
    last_message: lastMessage as LoadedDMConversation['last_message'],
    members: [
      {
        user_id: entry.viewer_id,
        role: 'member',
        is_muted: entry.is_muted,
        is_pinned: entry.is_pinned,
        last_read_at: entry.is_unread ? null : entry.latest_message_at || null,
      },
      ...(entry.other_profile_id
        ? [
            {
              user_id: entry.other_profile_id,
              role: 'member' as const,
              is_muted: false,
              is_pinned: false,
              last_read_at: null,
              profile: {
                id: entry.other_profile_id,
                username: entry.username || undefined,
                display_name: entry.display_name,
                avatar_url: entry.avatar_url,
              },
            },
          ]
        : []),
    ],
    _sortTime: entry.latest_message_at || entry.updated_at || '',
    _hasUnread: entry.is_unread || entry.unread_count > 0,
  } as LoadedDMConversation;
}
