import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compareInboxPriority } from '@/lib/dmInboxPriority';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';
import { safeDmMembers, ensureArray } from '@/lib/persistedCollections';

export type DmInboxSectionId =
  | 'needs_reply'
  | 'unread'
  | 'pinned'
  | 'recent'
  | 'all';

export type DmInboxTabId =
  | 'friends'
  | 'best_friends'
  | 'nearby'
  | 'groups'
  | 'requests'
  | 'unread';

export interface DmInboxSection {
  id: DmInboxSectionId;
  label: string;
  conversations: LoadedDMConversation[];
}

export interface DmInboxTabFilterOptions {
  profileId?: string;
  requestConversationIds?: Set<string>;
  callConversationIds?: Set<string>;
  closeFriendIds?: Set<string>;
  nearbyProfileIds?: Set<string>;
  resolveOtherProfileId?: (conversation: LoadedDMConversation) => string | undefined;
}

function sortByPriority(
  a: LoadedDMConversation,
  b: LoadedDMConversation,
  profileId?: string,
): number {
  return compareInboxPriority(a, b, profileId);
}

function isPinnedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

/** Filter rows for smart inbox tab. */
export function filterConversationsForTab(
  rows: LoadedDMConversation[],
  tab: DmInboxTabId,
  profileIdOrOptions?: string | DmInboxTabFilterOptions,
  requestConversationIds?: Set<string>,
  callConversationIds?: Set<string>,
): LoadedDMConversation[] {
  const options: DmInboxTabFilterOptions =
    typeof profileIdOrOptions === 'object' && profileIdOrOptions !== null
      ? profileIdOrOptions
      : {
          profileId: typeof profileIdOrOptions === 'string' ? profileIdOrOptions : undefined,
          requestConversationIds,
          callConversationIds,
        };
  const {
    requestConversationIds: requestIds,
    callConversationIds: callIds,
    closeFriendIds,
    nearbyProfileIds,
    resolveOtherProfileId,
  } = options;
  const safe = ensureArray(rows);
  switch (tab) {
    case 'groups':
      return safe.filter((c) => c.is_group);
    case 'friends':
      return safe.filter(
        (c) => !c.is_group && !(requestIds?.size && requestIds.has(c.id)),
      );
    case 'best_friends':
      if (!closeFriendIds?.size) return [];
      return safe.filter((c) => {
        if (c.is_group) return false;
        const otherId = resolveOtherProfileId?.(c);
        return Boolean(otherId && closeFriendIds.has(otherId));
      });
    case 'nearby':
      if (!nearbyProfileIds?.size) return [];
      return safe.filter((c) => {
        if (c.is_group) return false;
        const otherId = resolveOtherProfileId?.(c);
        return Boolean(otherId && nearbyProfileIds.has(otherId));
      });
    case 'unread':
      return safe.filter(
        (c) =>
          (c.unread_count || 0) > 0 ||
          c._hasUnread ||
          Boolean(callIds?.has(c.id)),
      );
    case 'requests':
      // Conversation matches are optional — pending requests render as dedicated rows.
      if (!requestIds?.size) return [];
      return safe.filter((c) => requestIds.has(c.id));
    default:
      return safe;
  }
}

/** Group + sort conversations for the iconic VYBE inbox layout. */
export function organizeDmInbox(
  rows: LoadedDMConversation[],
  profileId?: string,
): DmInboxSection[] {
  const safeRows = ensureArray<LoadedDMConversation>(rows).filter(
    (c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0,
  );

  const needsReply: LoadedDMConversation[] = [];
  const unread: LoadedDMConversation[] = [];
  const pinned: LoadedDMConversation[] = [];
  const recent: LoadedDMConversation[] = [];
  const rest: LoadedDMConversation[] = [];

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const conv of safeRows) {
    const hasUnread = (conv.unread_count || 0) > 0 || conv._hasUnread;
    const pinnedRow = isPinnedForViewer(conv, profileId);
    const needs = conversationNeedsReply(conv, profileId);
    const sortMs = new Date(conv.last_message?.created_at ?? conv.created_at ?? 0).getTime();

    if (needs && !pinnedRow) {
      needsReply.push(conv);
    } else if (hasUnread && !pinnedRow) {
      unread.push(conv);
    } else if (pinnedRow) {
      pinned.push(conv);
    } else if (sortMs >= weekAgo) {
      recent.push(conv);
    } else {
      rest.push(conv);
    }
  }

  const sortFn = (a: LoadedDMConversation, b: LoadedDMConversation) =>
    sortByPriority(a, b, profileId);

  needsReply.sort(sortFn);
  unread.sort(sortFn);
  pinned.sort(sortFn);
  recent.sort(sortFn);
  rest.sort(sortFn);

  const sections: DmInboxSection[] = [];
  if (needsReply.length) {
    sections.push({ id: 'needs_reply', label: 'Needs reply', conversations: needsReply });
  }
  if (unread.length) sections.push({ id: 'unread', label: 'New', conversations: unread });
  if (pinned.length) sections.push({ id: 'pinned', label: 'Pinned', conversations: pinned });
  if (recent.length) sections.push({ id: 'recent', label: 'This week', conversations: recent });
  if (rest.length) sections.push({ id: 'all', label: 'Earlier', conversations: rest });

  if (!sections.length && safeRows.length) {
    sections.push({
      id: 'all',
      label: 'Chats',
      conversations: [...safeRows].sort(sortFn),
    });
  }

  return sections;
}

export type DmInboxRow =
  | { type: 'header'; id: DmInboxSectionId; label: string; count: number }
  | { type: 'conversation'; conversation: LoadedDMConversation };

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
