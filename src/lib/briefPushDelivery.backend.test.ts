// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ preferences: vi.fn(), provider: vi.fn(), multicast: vi.fn(), update: vi.fn(), tokenReads: vi.fn() }));
vi.mock('../../functions/src/_shared/notificationPreferenceAuthority.js', () => ({ readDeliveryNotificationPreferences: state.preferences, manageNotificationPreferencesFor: vi.fn() }));
vi.mock('../../functions/src/_shared/admin.js', () => ({
  requireAuth: () => 'alice', rateLimit: async () => true, enforceRateLimit: () => {},
  messaging: { sendEachForMulticast: state.multicast },
  db: { collection: (name: string) => {
    const query = { where: () => query, limit: () => query, get: async () => {
      if (name === 'daily_brief_cache') return { docs: [{ data: () => ({ user_id: 'profile-alice' }), ref: { update: state.update } }] };
      if (name === 'push_tokens') { state.tokenReads(); return { empty: false, docs: [{ data: () => ({ token: 'synthetic-token' }) }] }; }
      throw new Error(`Unexpected collection ${name}`);
    } }; return query;
  } },
}));
vi.mock('../../functions/src/_shared/fcmPush.js', () => ({ dispatchPushToProfile: state.provider, dispatchCallPushToProfile: vi.fn(), dispatchDmPushToProfile: vi.fn() }));
vi.mock('../../functions/src/_shared/onesignalPush.js', () => ({ dispatchOneSignalToProfile: vi.fn(), lookupOneSignalSubscriptionIdsForProfile: vi.fn(), resolvePushTargetProfileId: vi.fn() }));
vi.mock('../../functions/src/_shared/socialFeedAuthority.js', () => ({ readPublicSocialPost: vi.fn() }));
vi.mock('../../functions/src/_shared/geminiAi.js', () => ({ chatCompletion: vi.fn() }));
import { smartBriefPings } from '../../functions/src/briefs';
import { sendBriefNotification } from '../../functions/src/push';
import { isPushAllowedForType, prefKeyForPushType } from '../../functions/src/_shared/pushPreferences';
const scheduled = smartBriefPings.run as unknown as () => Promise<void>;
const requested = sendBriefNotification.run as unknown as (request: unknown) => Promise<unknown>;
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 4, 12, 0)); state.preferences.mockResolvedValue({ brief_pings_enabled: true }); state.provider.mockResolvedValue({ sent: 1 }); state.multicast.mockResolvedValue({ successCount: 1 }); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(['smart_ping', 'brief', 'daily_brief'])('maps the actual emitted %s type to brief preferences', type => { expect(prefKeyForPushType(type)).toBe('brief_pings_enabled'); expect(isPushAllowedForType(type, { brief_pings_enabled: false })).toBe(false); });
it('maps actual post reactions to likes without inventing unrelated producers', () => { expect(prefKeyForPushType('reaction')).toBe('likes_enabled'); expect(isPushAllowedForType('reaction', { likes_enabled: false })).toBe(false); });
it.each([
  { brief_pings_enabled: false },
  { brief_pings_enabled: true, quiet_hours_start: '11:00', quiet_hours_end: '13:00' },
  { brief_pings_enabled: true, brief_muted_until: new Date(2026, 9, 4, 13, 0).getTime() },
])('both producers skip provider and acknowledgement when current preferences suppress delivery: %j', async preferences => {
  state.preferences.mockResolvedValue(preferences);
  await scheduled(); expect(await requested({ data: {} })).toMatchObject({ ok: true, sent: 0 });
  expect(state.multicast).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled(); expect(state.tokenReads).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
});
it('preference read errors fail closed in both real producer handlers', async () => {
  state.preferences.mockRejectedValue(new Error('Settings unreadable'));
  await scheduled(); await expect(requested({ data: {} })).rejects.toThrow('Settings unreadable');
  expect(state.multicast).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
});
it('an expired mute allows configured brief delivery and does not suppress unrelated notifications', async () => {
  state.preferences.mockResolvedValue({ brief_pings_enabled: true, brief_muted_until: Date.now() - 1 });
  await scheduled(); expect(await requested({ data: { title: 'Title', body: 'Body' } })).toMatchObject({ ok: true, sent: 1 });
  expect(state.multicast).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'daily_brief' }) }));
  expect(state.provider).toHaveBeenCalledWith('alice', { title: 'Title', body: 'Body', type: 'brief' }); expect(state.update).toHaveBeenCalledWith({ pinged: true });
  expect(isPushAllowedForType('dm', { brief_muted_until: Date.now() + 10000 })).toBe(true);
});
