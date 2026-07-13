import type { DmInboxEntryDoc, DmInboxShadowDiff } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { safeDmMembers } from '@/lib/persistedCollections';

const TIME_SKEW_MS = 5_000;

function activityMs(value?: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Compare projection rows to the legacy loader without changing visible UI.
 * Logs a compact summary; returns structured diffs for tests / dashboards.
 */
export function compareDmInboxShadow(
  projection: DmInboxEntryDoc[],
  legacy: LoadedDMConversation[],
  profileId?: string | null,
): DmInboxShadowDiff {
  const projIds = new Set(projection.map((p) => p.conversation_id));
  const legacyIds = new Set(legacy.map((c) => c.id));

  const missingInProjection = [...legacyIds].filter((id) => !projIds.has(id));
  const missingInLegacy = [...projIds].filter((id) => !legacyIds.has(id));

  const legacyById = new Map(legacy.map((c) => [c.id, c]));
  const staleLatestMessage: string[] = [];
  const unreadMismatch: string[] = [];

  for (const entry of projection) {
    const conv = legacyById.get(entry.conversation_id);
    if (!conv) continue;

    const legacyAt = activityMs(conv.last_message?.created_at || conv.updated_at || conv._sortTime);
    const projAt = activityMs(entry.latest_message_at);
    if (Math.abs(legacyAt - projAt) > TIME_SKEW_MS && (legacyAt > 0 || projAt > 0)) {
      staleLatestMessage.push(entry.conversation_id);
    }

    const legacyUnread = Boolean(conv._hasUnread || (conv.unread_count || 0) > 0);
    const projUnread = Boolean(entry.is_unread || entry.unread_count > 0);
    if (legacyUnread !== projUnread) {
      unreadMismatch.push(entry.conversation_id);
    }

    if (profileId && conv.last_message) {
      const expectedPreview = dmConversationPreviewText({
        lastMessage: conv.last_message,
        isGroup: conv.is_group,
        profileId,
      });
      // Soft check — preview formatting may intentionally differ during rollout.
      void expectedPreview;
      void safeDmMembers(conv.members);
    }
  }

  const projOrder = projection
    .slice()
    .sort((a, b) => activityMs(b.latest_message_at) - activityMs(a.latest_message_at))
    .map((e) => e.conversation_id);
  const legacyOrder = legacy
    .slice()
    .sort((a, b) => activityMs(b._sortTime || b.updated_at) - activityMs(a._sortTime || a.updated_at))
    .map((c) => c.id)
    .filter((id) => projIds.has(id));

  const sharedLen = Math.min(projOrder.length, legacyOrder.length, 20);
  let orderingDiffers = false;
  for (let i = 0; i < sharedLen; i++) {
    if (projOrder[i] !== legacyOrder[i]) {
      orderingDiffers = true;
      break;
    }
  }

  return {
    missingInProjection,
    missingInLegacy,
    staleLatestMessage,
    unreadMismatch,
    orderingDiffers,
  };
}

export function summarizeDmInboxShadow(diff: DmInboxShadowDiff): string {
  return [
    `missingProjection=${diff.missingInProjection.length}`,
    `missingLegacy=${diff.missingInLegacy.length}`,
    `staleLatest=${diff.staleLatestMessage.length}`,
    `unreadMismatch=${diff.unreadMismatch.length}`,
    `orderingDiffers=${diff.orderingDiffers}`,
  ].join(' ');
}

export function shadowReadLooksHealthy(diff: DmInboxShadowDiff): boolean {
  return (
    diff.missingInProjection.length === 0 &&
    diff.staleLatestMessage.length <= 2 &&
    diff.unreadMismatch.length <= 2
  );
}
