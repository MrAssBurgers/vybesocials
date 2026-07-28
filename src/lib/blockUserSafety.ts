import { db } from '@/lib/firebase';

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
}): Promise<void> {
  const { error: blockError } = await db.from('blocked_users').insert({
    blocker_id: opts.blockerId,
    blocked_id: opts.blockedId,
  });
  if (blockError && !blockError.message.includes('duplicate')) throw blockError;

  const reason = opts.context
    ? `User blocked — moderation review requested (${opts.context})`
    : 'User blocked — moderation review requested';
  const { error: reportError } = await db.from('reports').insert({
    reporter_id: opts.blockerId,
    reported_user_id: opts.blockedId,
    reason,
  } as Record<string, unknown>);
  if (reportError) throw new BlockSafetyNotificationError();
}
