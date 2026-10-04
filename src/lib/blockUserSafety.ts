import { db } from '@/lib/firebase';
import { isReportSessionError, reportAccountGuard, submitSafetyReport } from '@/lib/reportModerationService';

export class BlockSafetyNotificationError extends Error {
  constructor() {
    super('User blocked, but the safety team could not be notified. Please also submit a report.');
    this.name = 'BlockSafetyNotificationError';
  }
}

/**
 * Block a user and notify moderation in the same user action.
 *
 * Apple Guideline 1.2 requires blocking abusive users to also notify the
 * developer. A failed moderation notice is surfaced so the UI cannot claim a
 * fully successful safety action when only half of it completed.
 */
export async function blockUserAndNotifyModeration(opts: {
  blockerId: string;
  blockedId: string;
  context?: string;
}): Promise<{ blocked: true; reportSubmitted: boolean; guard: () => void }> {
  const guard = reportAccountGuard();
  guard();
  const { error: blockError } = await db.from('blocked_users').insert({
    blocker_id: opts.blockerId,
    blocked_id: opts.blockedId,
  });
  if (blockError && !blockError.message.includes('duplicate')) throw blockError;
  guard();
  try {
    await submitSafetyReport({ targetType: 'profile', targetId: opts.blockedId, reason: 'blocked_user', details: opts.context }, guard);
    return { blocked: true, reportSubmitted: true, guard };
  } catch (error) {
    if (isReportSessionError(error)) throw error;
    // Blocking already committed. Callers must hide blocked content even if
    // the separate moderation service cannot acknowledge its report yet.
    guard();
    return { blocked: true, reportSubmitted: false, guard };
  }
}
