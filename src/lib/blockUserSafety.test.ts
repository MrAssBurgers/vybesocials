import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {
    from: (table: string) => ({
      insert: (payload: unknown) => insert(table, payload),
    }),
  },
}));

import { blockUserAndNotifyModeration } from './blockUserSafety';

describe('blockUserAndNotifyModeration', () => {
  beforeEach(() => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
  });

  it('blocks immediately and creates a moderation report', async () => {
    await blockUserAndNotifyModeration({
      blockerId: 'viewer-1',
      blockedId: 'author-2',
      context: 'post p1',
    });

    expect(insert).toHaveBeenNthCalledWith(1, 'blocked_users', {
      blocker_id: 'viewer-1',
      blocked_id: 'author-2',
    });
    expect(insert).toHaveBeenNthCalledWith(
      2,
      'reports',
      expect.objectContaining({
        reporter_id: 'viewer-1',
        reported_user_id: 'author-2',
        reason: expect.stringContaining('post p1'),
      }),
    );
  });

  it('still notifies moderation when the block already exists', async () => {
    insert
      .mockResolvedValueOnce({ error: { message: 'duplicate document' } })
      .mockResolvedValueOnce({ error: null });

    await expect(
      blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' }),
    ).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('surfaces a moderation-report failure', async () => {
    insert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'report denied' } });

    await expect(
      blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' }),
    ).rejects.toMatchObject({
      message: 'User blocked, but the safety team could not be notified. Please also submit a report.',
      name: 'BlockSafetyNotificationError',
    });
  });
});
