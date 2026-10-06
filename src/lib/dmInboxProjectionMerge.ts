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
  /** Current viewer context supplied by the caller. */
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
 * Keep separately admitted conversation histories, even for the same person.
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
  for (const conversation of filteredLegacy) {
    if (seen.has(conversation.id)) continue;
    const projected = projectionById.get(conversation.id);
    const row = projected ? patchProjectionOntoLegacy(conversation, projected) : conversation;
    ordered.push(row);
    seen.add(conversation.id);
  }

  for (const entry of projectionEntries) {
    const id = entry.conversation_id;
    if (lockedIds.has(id) || seen.has(id)) continue;
    const row = projectionById.get(id);
    if (!row) continue;
    ordered.push(row);
    seen.add(id);
  }

  return ordered.length ? ordered : filteredLegacy;
}
