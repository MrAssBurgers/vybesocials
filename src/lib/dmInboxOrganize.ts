import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compareDmConversations, getDmConversationSortTime } from '@/lib/dmConversationSort';
import { safeDmMembers, ensureArray } from '@/lib/persistedCollections';

export type DmInboxSectionId = 'unread' | 'pinned' | 'recent' | 'all';

export interface DmInboxSection {
  id: DmInboxSectionId;
  label: string;
  conversations: LoadedDMConversation[];
}

function sortByActivity(
  a: LoadedDMConversation,
  b: LoadedDMConversation,
  profileId?: string,
): number {
  return compareDmConversations(a, b, profileId);
}

function isPinnedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

/** Group + sort conversations for the iconic VYBE inbox layout. */
export function organizeDmInbox(
  rows: LoadedDMConversation[],
  profileId?: string,
): DmInboxSection[] {
  const safeRows = ensureArray<LoadedDMConversation>(rows).filter(
    (c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0,
  );

  const unread: LoadedDMConversation[] = [];
  const pinned: LoadedDMConversation[] = [];
  const recent: LoadedDMConversation[] = [];
  const rest: LoadedDMConversation[] = [];

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const conv of safeRows) {
    const hasUnread = (conv.unread_count || 0) > 0 || conv._hasUnread;
    const pinnedRow = isPinnedForViewer(conv, profileId);
    const sortMs = new Date(getDmConversationSortTime(conv)).getTime();

    if (hasUnread) {
      unread.push(conv);
    } else if (pinnedRow) {
      pinned.push(conv);
    } else if (sortMs >= weekAgo) {
      recent.push(conv);
    } else {
      rest.push(conv);
    }
  }

  unread.sort((a, b) => sortByActivity(a, b, profileId));
  pinned.sort((a, b) => sortByActivity(a, b, profileId));
  recent.sort((a, b) => sortByActivity(a, b, profileId));
  rest.sort((a, b) => sortByActivity(a, b, profileId));

  const sections: DmInboxSection[] = [];
  if (unread.length) sections.push({ id: 'unread', label: 'New', conversations: unread });
  if (pinned.length) sections.push({ id: 'pinned', label: 'Pinned', conversations: pinned });
  if (recent.length) sections.push({ id: 'recent', label: 'This week', conversations: recent });
  if (rest.length) sections.push({ id: 'all', label: 'Earlier', conversations: rest });

  if (!sections.length && safeRows.length) {
    sections.push({
      id: 'all',
      label: 'Chats',
      conversations: [...safeRows].sort((a, b) => sortByActivity(a, b, profileId)),
    });
  }

  return sections;
}

export type DmInboxRow =
  | { type: 'header'; id: DmInboxSectionId; label: string; count: number }
  | { type: 'conversation'; conversation: LoadedDMConversation };

/** Flat list with section headers — keeps stable `conv.id` keys when rows change sections. */
export function buildFlatInboxRows(
  rows: LoadedDMConversation[],
  profileId?: string,
): DmInboxRow[] {
  const sections = organizeDmInbox(rows, profileId);
  const flat: DmInboxRow[] = [];
  for (const section of sections) {
    flat.push({
      type: 'header',
      id: section.id,
      label: section.label,
      count: section.conversations.length,
    });
    for (const conversation of section.conversations) {
      flat.push({ type: 'conversation', conversation });
    }
  }
  return flat;
}
