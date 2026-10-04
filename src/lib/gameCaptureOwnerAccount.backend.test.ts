// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rateLimit: vi.fn(async () => true) }));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: {}, requireAuth: (request: { auth: { uid: string } }) => request.auth.uid, rateLimit: state.rateLimit, enforceRateLimit: vi.fn() }));
import { createGameCapture, getGameCapture, finishGameCapture, discardGameCapture, completeGameCapture } from '../../functions/src/gameIntegration';
beforeEach(() => state.rateLimit.mockClear());
describe('server binding of first-party capture intent', () => {
  for (const callable of [createGameCapture, getGameCapture, finishGameCapture, discardGameCapture, completeGameCapture]) {
    it.each(['alice', '', null, 7])('rejects mismatched owner before database work (%s)', async expectedOwnerUid => {
      await expect(callable.run({ auth: { uid: 'bob' }, data: { expectedOwnerUid } } as never)).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(state.rateLimit).not.toHaveBeenCalled();
    });
    it.each(['bob', undefined])('retains matching and legacy validation (%s)', async expectedOwnerUid => {
      await expect(callable.run({ auth: { uid: 'bob' }, data: { expectedOwnerUid } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(state.rateLimit).toHaveBeenCalledOnce();
    });
  }
});
