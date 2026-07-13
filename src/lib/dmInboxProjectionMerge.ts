import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { projectionToLoadedConversation } from '@/lib/dmInboxProjection';

export interface MergeLegacyProjectionInput {
  legacy: LoadedDMConversation[];
  projectionEntries: DmInboxEntryDoc[];
  lockedIds: Set<string>;
  projectionReadEnabled: boolean;
  projectionReady: boolean;
}

/**
 * Patch projection fields onto legacy order.
 * Never replace the whole list with projection-only order (that remount-jumps rows).
 * Never drop legacy rows when projection is partial/empty.
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

  // Preserve legacy order — patch fields from projection when available.
  for (const conversation of filteredLegacy) {
    ordered.push(projectionById.get(conversation.id) ?? conversation);
    seen.add(conversation.id);
  }

  // Append projection-only conversations (new) without reordering the rest.
  for (const entry of projectionEntries) {
    const id = entry.conversation_id;
    if (lockedIds.has(id) || seen.has(id)) continue;
    const row = projectionById.get(id);
    if (row) {
      ordered.push(row);
      seen.add(id);
    }
  }

  return ordered.length ? ordered : filteredLegacy;
}
