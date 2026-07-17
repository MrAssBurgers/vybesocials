import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { projectionToLoadedConversation } from '@/lib/dmInboxProjection';
import { pickNewerMessageClock } from '@/lib/sortInboxConversations';

export interface MergeLegacyProjectionInput {
  legacy: LoadedDMConversation[];
  projectionEntries: DmInboxEntryDoc[];
  lockedIds: Set<string>;
  projectionReadEnabled: boolean;
  projectionReady: boolean;
  /** Current viewer — used so 1:1 person-dedupe ignores self. */
  viewerId?: string | null;
  viewerAuthUid?: string | null;
}

/**
 * Patch projection display/unread onto legacy rows without rewriting the sort clock
 * unless projection has a newer real message timestamp.
 */
export function patchProjectionOntoLegacy(
  legacy: LoadedDMConversation,
  projected: LoadedDMConversation,
): LoadedDMConversation {
  const legacyMsgAt = legacy.last_message?.created_at;
  const projectedMsgAt = projected.last_message?.created_at;
  const clock = pickNewerMessageClock(legacyMsgAt, projectedMsgAt);
  const useProjectedMessage =
    Boolean(projected.last_message?.id && projectedMsgAt) &&
    clock === projectedMsgAt &&
    (!legacyMsgAt || Date.parse(projectedMsgAt!) >= Date.parse(legacyMsgAt));

  const last_message = useProjectedMessage
    ? projected.last_message
    : legacy.last_message ?? projected.last_message;

  return {
    ...legacy,
    name: projected.name ?? legacy.name,
    unread_count: projected.unread_count ?? legacy.unread_count,
    _hasUnread: projected._hasUnread ?? legacy._hasUnread,
    members: projected.members?.length ? projected.members : legacy.members,
    last_message,
    // Sort clock follows real message only — never projection.updated_at.
    _sortTime: last_message?.created_at || legacy.created_at || '',
    updated_at: legacy.updated_at,
  };
}

/**
 * Patch projection fields onto legacy order.
 * Never replace the whole list with projection-only order (that remount-jumps rows).
 * Never drop legacy rows when projection is partial/empty.
 * Never let projection write-time reshuffle inbox order.
 * Never re-introduce 1:1 rows for a person legacy already deduped away.
 */
export function mergeLegacyAndProjection(
  input: MergeLegacyProjectionInput,
): LoadedDMConversation[] {
  const {
    legacy,
    projectionEntries,
    lockedIds,
    projectionReadEnabled,
    projectionReady,
    viewerId = null,
    viewerAuthUid = null,
  } = input;

  const filteredLegacy = legacy.filter((c) => !lockedIds.has(c.id));
  if (!projectionReadEnabled || !projectionReady || !projectionEntries.length) {
    return filteredLegacy;
  }

  const projectionById = new Map<string, LoadedDMConversation>();
  for (const entry of projectionEntries) {
    if (lockedIds.has(entry.conversation_id)) continue;
    projectionById.set(entry.conversation_id, projectionToLoadedConversation(entry));
  }

  const ordered: LoadedDMConversation[] = [];
  const seen = new Set<string>();
  const seenOtherKeys = new Set<string>();

  const isSelfId = (id: string) =>
    Boolean(id) && (id === viewerId || (viewerAuthUid != null && id === viewerAuthUid));

  const otherKeyForConversation = (conversation: LoadedDMConversation): string | null => {
    if (conversation.is_group) return null;
    const members = conversation.members || [];
    for (const m of members as Array<{ user_id?: string; profile?: { id?: string; username?: string } }>) {
      const id = String(m.profile?.id || m.user_id || '');
      if (!id || isSelfId(id)) continue;
      const uname = String(m.profile?.username || '').toLowerCase();
      if (uname) return `u:${uname}`;
      return `id:${id}`;
    }
    return null;
  };

  const otherKeyForEntry = (entry: DmInboxEntryDoc): string | null => {
    if (entry.conversation_type === 'group' || (entry as { is_group?: boolean }).is_group) return null;
    const uname = String(entry.username || '').toLowerCase();
    if (uname) return `u:${uname}`;
    if (entry.other_profile_id) return `id:${entry.other_profile_id}`;
    return null;
  };

  for (const conversation of filteredLegacy) {
    const projected = projectionById.get(conversation.id);
    const row = projected ? patchProjectionOntoLegacy(conversation, projected) : conversation;
    ordered.push(row);
    seen.add(conversation.id);
    const key = otherKeyForConversation(row);
    if (key) seenOtherKeys.add(key);
  }

  for (const entry of projectionEntries) {
    const id = entry.conversation_id;
    if (lockedIds.has(id) || seen.has(id)) continue;
    const key = otherKeyForEntry(entry);
    if (key && seenOtherKeys.has(key)) continue;
    const row = projectionById.get(id);
    if (!row) continue;
    ordered.push(row);
    seen.add(id);
    if (key) seenOtherKeys.add(key);
  }

  return ordered.length ? ordered : filteredLegacy;
}
