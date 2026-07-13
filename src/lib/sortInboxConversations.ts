import type { DMConversationPreview } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { safeDmMembers } from '@/lib/persistedCollections';

/** Snapchat-stable inbox sort inputs — no presence/typing/unread/rank fields. */
export interface InboxSortable {
  conversationId: string;
  isPinned: boolean;
  pinOrder: number;
  latestMessageAt: string;
}

function parseSortMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Sort clock = real message time only.
 * Never use conversation.updated_at, projection.updated_at, or polluted `_sortTime`.
 */
export function getInboxLatestMessageAt(conv: LoadedDMConversation): string {
  const fromMessage = conv.last_message?.created_at;
  if (typeof fromMessage === 'string' && fromMessage.trim()) {
    return fromMessage;
  }
  // Empty thread — conversation create time is fine; never projection write time.
  return typeof conv.created_at === 'string' ? conv.created_at : '';
}

export function getInboxPinState(
  conv: LoadedDMConversation,
  profileId?: string | null,
): { isPinned: boolean; pinOrder: number } {
  if (!profileId) return { isPinned: false, pinOrder: 9999 };
  const membership = safeDmMembers(conv.members).find((m) => m.user_id === profileId) as
    | { is_pinned?: boolean; pin_order?: number | null }
    | undefined;
  const isPinned = Boolean(membership?.is_pinned);
  const raw = membership?.pin_order;
  const pinOrder =
    typeof raw === 'number' && Number.isFinite(raw) ? raw : isPinned ? 0 : 9999;
  return { isPinned, pinOrder };
}

export function toInboxSortable(
  conv: LoadedDMConversation,
  profileId?: string | null,
): InboxSortable {
  const pin = getInboxPinState(conv, profileId);
  return {
    conversationId: conv.id,
    isPinned: pin.isPinned,
    pinOrder: pin.pinOrder,
    latestMessageAt: getInboxLatestMessageAt(conv),
  };
}

/**
 * Stable DM inbox order (Snapchat-style):
 * 1. Manually pinned (by pinOrder)
 * 2. latestMessageAt descending
 * 3. conversationId ascending
 *
 * Never uses presence, typing, unread, streak, rank, or story state.
 */
export function compareInboxSortables(a: InboxSortable, b: InboxSortable): number {
  if (a.isPinned !== b.isPinned) {
    return a.isPinned ? -1 : 1;
  }
  if (a.isPinned && b.isPinned) {
    const byPin = (a.pinOrder ?? 9999) - (b.pinOrder ?? 9999);
    if (byPin !== 0) return byPin;
    return a.conversationId.localeCompare(b.conversationId);
  }
  const timeDifference =
    parseSortMs(b.latestMessageAt) - parseSortMs(a.latestMessageAt);
  if (timeDifference !== 0) return timeDifference;
  return a.conversationId.localeCompare(b.conversationId);
}

export function sortInboxConversations(
  conversations: LoadedDMConversation[],
  profileId?: string | null,
): LoadedDMConversation[] {
  return [...conversations].sort((a, b) =>
    compareInboxSortables(toInboxSortable(a, profileId), toInboxSortable(b, profileId)),
  );
}

export function sortInboxPreviews(
  rows: DMConversationPreview[],
): DMConversationPreview[] {
  return [...rows].sort((a, b) =>
    compareInboxSortables(
      {
        conversationId: a.conversationId || a.id,
        isPinned: Boolean(a.isPinned),
        pinOrder: Number.isFinite(a.pinOrder) ? a.pinOrder : 9999,
        latestMessageAt: a.latestMessageAt || '',
      },
      {
        conversationId: b.conversationId || b.id,
        isPinned: Boolean(b.isPinned),
        pinOrder: Number.isFinite(b.pinOrder) ? b.pinOrder : 9999,
        latestMessageAt: b.latestMessageAt || '',
      },
    ),
  );
}

/** Prefer the newer real message timestamp; never invent "now". */
export function pickNewerMessageClock(
  legacyAt: string | null | undefined,
  projectionAt: string | null | undefined,
): string {
  const a = parseSortMs(legacyAt);
  const b = parseSortMs(projectionAt);
  if (b > a) return String(projectionAt);
  if (a > 0) return String(legacyAt);
  return typeof projectionAt === 'string' ? projectionAt : typeof legacyAt === 'string' ? legacyAt : '';
}

/** Compare two order id lists — used by stability tests. */
export function inboxOrderFingerprint(ids: string[]): string {
  return ids.join('\0');
}
