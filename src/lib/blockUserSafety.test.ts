import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), report: vi.fn(), uid: 'viewer-1', epoch: 0 }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => ({ insert: (payload: unknown) => mocks.insert(table, payload) }) } }));
vi.mock('@/lib/reportModerationService', () => ({
  submitSafetyReport: mocks.report,
  isReportSessionError: (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'account-changed',
  reportAccountGuard: () => {
    const uid = mocks.uid; const epoch = mocks.epoch;
    return () => { if (!uid || uid !== mocks.uid || epoch !== mocks.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); };
  },
}));
import { blockUserAndNotifyModeration } from './blockUserSafety';

describe('blockUserAndNotifyModeration', () => {
  beforeEach(() => {
    mocks.uid = 'viewer-1'; mocks.epoch = 0;
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.report.mockReset().mockResolvedValue({ success: true });
  });

  it('confirms the block and submits only a profile target through the verified report service', async () => {
    const result = await blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2', context: 'post p1' });
    expect(result).toMatchObject({ blocked: true, reportSubmitted: true });
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith('blocked_users', { blocker_id: 'viewer-1', blocked_id: 'author-2' });
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith({ targetType: 'profile', targetId: 'author-2', reason: 'blocked_user', details: 'post p1' }, expect.any(Function));
    expect(() => result.guard()).not.toThrow();
  });

  it('still requests moderation when the existing block is a duplicate', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'duplicate document' } });
    await expect(blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' })).resolves.toMatchObject({ blocked: true, reportSubmitted: true });
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('returns the confirmed block for immediate hiding when its separate report fails', async () => {
    mocks.report.mockRejectedValue(new Error('Reporting temporarily unavailable'));
    const result = await blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' });
    expect(result).toMatchObject({ blocked: true, reportSubmitted: false });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(() => result.guard()).not.toThrow();
  });

  it('does not submit a report or claim a block when the block itself fails', async () => {
    const denied = { message: 'permission-denied' };
    mocks.insert.mockResolvedValue({ error: denied });
    await expect(blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' })).rejects.toBe(denied);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('stops before reporting if the account changes while blocking', async () => {
    mocks.insert.mockImplementation(async () => { mocks.uid = 'other-account'; return { error: null }; });
    await expect(blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' })).rejects.toMatchObject({ code: 'account-changed' });
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('does not turn a changed account during reporting into a current-account partial success', async () => {
    mocks.report.mockImplementation(async () => { mocks.epoch++; throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); });
    await expect(blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' })).rejects.toMatchObject({ code: 'account-changed' });
  });

  it('returns a guard that suppresses later account-bound cache and UI completion', async () => {
    const result = await blockUserAndNotifyModeration({ blockerId: 'viewer-1', blockedId: 'author-2' });
    mocks.epoch++;
    expect(() => result.guard()).toThrow('Account changed');
  });
});
