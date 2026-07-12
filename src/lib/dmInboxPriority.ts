import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { getDmConversationSortTime } from '@/lib/dmConversationSort';
import { safeDmMembers } from '@/lib/persistedCollections';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';

export interface InboxPriorityInput {
  conv: LoadedDMConversation;
  profileId?: string | null;
  /** Missed call count in last 7 days (optional). */
  missedCalls?: number;
  /** Friend streak length with DM peer (optional). */
  streakCount?: number;
  /** @mention in last message preview */
  hasMention?: boolean;
}

function isPinnedForViewer(conv: LoadedDMConversation, profileId?: string | null): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

function isFavoriteForViewer(conv: LoadedDMConversation, profileId?: string | null): boolean {
  if (!profileId) return false;
  const m = safeDmMembers(conv.members).find((x) => x.user_id === profileId) as
    | { is_favorite?: boolean }
    | undefined;
  return Boolean(m?.is_favorite);
}

/** Higher score = higher in inbox (within same pin tier). */
export function computeInboxPriorityScore(input: InboxPriorityInput): number {
  const { conv, profileId, missedCalls = 0, streakCount = 0, hasMention = false } = input;
  let score = 0;

  const unread = (conv.unread_count || 0) > 0 || conv._hasUnread;
  if (unread) score += 1000;
  if (conversationNeedsReply(conv, profileId)) score += 800;
  if (hasMention) score += 400;
  if (isPinnedForViewer(conv, profileId)) score += 300;
  if (isFavoriteForViewer(conv, profileId)) score += 200;
  if (missedCalls > 0) score += 150 + Math.min(missedCalls, 5) * 20;
  if (streakCount > 0) score += Math.min(streakCount, 30) * 5;

  const sortMs = new Date(getDmConversationSortTime(conv)).getTime();
  if (Number.isFinite(sortMs)) {
    score += sortMs / 1e12;
  }

  return score;
}

export function compareInboxPriority(
  a: LoadedDMConversation,
  b: LoadedDMConversation,
  profileId?: string | null,
): number {
  const aPinned = isPinnedForViewer(a, profileId);
  const bPinned = isPinnedForViewer(b, profileId);
  if (aPinned && !bPinned) return -1;
  if (!aPinned && bPinned) return 1;

  const scoreA = computeInboxPriorityScore({ conv: a, profileId });
  const scoreB = computeInboxPriorityScore({ conv: b, profileId });
  return scoreB - scoreA;
}
