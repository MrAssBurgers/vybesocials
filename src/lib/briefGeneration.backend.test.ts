// @vitest-environment node
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../../functions/src/_shared/admin.js', () => ({ requireAuth: vi.fn(), messaging: {}, db: { collection: (name: string) => {
  if (name === 'profiles') return { where: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [{ id: 'profile-alice' }] }) }) }) };
  return { doc: () => ({ get: async () => ({ exists: false }), set: state.save }) };
} } }));
vi.mock('../../functions/src/_shared/geminiAi.js', () => ({ chatCompletion: async () => ({ content: 'Synthetic brief' }) }));
vi.mock('../../functions/src/_shared/briefDelivery.js', () => ({ deliverBriefIfAllowed: vi.fn() }));
import { prewarmDailyBriefs } from '../../functions/src/briefs';
it('new server-generated briefs explicitly enter the pending notification query', async () => {
  await prewarmDailyBriefs.run({} as Parameters<typeof prewarmDailyBriefs.run>[0]);
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'profile-alice', content: 'Synthetic brief', pinged: false }));
});
