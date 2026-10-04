import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rateLimit: vi.fn(async () => true) }));
vi.mock('../../functions/src/_shared/admin', () => ({
  db: {}, requireAuth: (request: { auth: { uid: string } }) => request.auth.uid,
  rateLimit: state.rateLimit, enforceRateLimit: vi.fn(),
}));
import { sendDmMessage } from '../../functions/src/dmSend';
beforeEach(() => state.rateLimit.mockClear());
describe('server binding of DM sender intent', () => {
  it.each(['alice', '', null, 7])('rejects a mismatching or malformed expected sender (%s) before database work', async expectedSenderUid => {
    await expect(sendDmMessage.run({ auth: { uid: 'bob' }, data: { expectedSenderUid } } as never)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.rateLimit).not.toHaveBeenCalled();
  });
  it.each(['bob', undefined])('accepts matching or legacy caller into normal validation (%s)', async expectedSenderUid => {
    await expect(sendDmMessage.run({ auth: { uid: 'bob' }, data: { expectedSenderUid } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.rateLimit).toHaveBeenCalledWith('dm-send:bob', 60, 60);
  });
});
