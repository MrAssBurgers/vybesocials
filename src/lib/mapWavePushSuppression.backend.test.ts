// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), preferences: vi.fn(), collection: vi.fn(), resolve: vi.fn(), gate: vi.fn() }));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: { collection: mocks.collection } }));
vi.mock('../../functions/src/_shared/fcmPush.js', () => ({ dispatchDmPushToProfile: mocks.push, dispatchCallPushToProfile: vi.fn(), messagePreview: vi.fn() }));
vi.mock('../../functions/src/_shared/onesignalPush.js', () => ({ resolvePushTargetProfileId: mocks.resolve }));
vi.mock('../../functions/src/_shared/pushPreferences.js', () => ({ loadNotificationPreferences: mocks.preferences, isBlockedByQuietHours: () => false, isPushAllowedForType: () => true, sanitizeDmPushBody: vi.fn() }));
vi.mock('../../functions/src/_shared/notificationPreferenceAuthority.js', () => ({ readDeliveryNotificationContext: mocks.preferences }));
vi.mock('../../functions/src/_shared/smartPushGate.js', () => ({ logPushDelivery: vi.fn(), shouldSkipRecipientPush: mocks.gate }));
import { onSocialNotificationCreated } from '../../functions/src/pushTriggers';

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockImplementation(() => { throw new Error('Wave must not enter device delivery'); });
});

describe('map waves remain in-app until device registration proves recipient ownership', () => {
  it.each(['legacy-wave', `map-wave-${'a'.repeat(64)}`])('never reads mutable device targets or calls a provider for %s', async id => {
    await onSocialNotificationCreated.run({ data: { id, data: () => ({ type: 'map_wave', user_id: 'recipient', actor_id: 'sender', title: 'Sender', body: 'waved at you', wave_receipt_id: 'a'.repeat(64) }) } } as Parameters<typeof onSocialNotificationCreated.run>[0]);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
  it('also suppresses normalized legacy wave types', async () => {
    await onSocialNotificationCreated.run({ data: { id: 'legacy', data: () => ({ type: ' MAP_WAVE ', user_id: 'recipient' }) } } as Parameters<typeof onSocialNotificationCreated.run>[0]);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
});
