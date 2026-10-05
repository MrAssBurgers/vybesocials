// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ context: vi.fn(), push: vi.fn() }));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: {} }));
vi.mock('../../functions/src/_shared/notificationPreferenceAuthority.js', () => ({ readDeliveryNotificationContext: state.context, readDeliveryNotificationPreferences: vi.fn() }));
vi.mock('../../functions/src/_shared/fcmPush.js', () => ({ dispatchDmPushToProfile: state.push, dispatchCallPushToProfile: vi.fn(), messagePreview: vi.fn() }));
vi.mock('../../functions/src/_shared/onesignalPush.js', () => ({ resolvePushTargetProfileId: vi.fn() }));
vi.mock('../../functions/src/_shared/smartPushGate.js', () => ({ logPushDelivery: vi.fn(), shouldSkipRecipientPush: vi.fn() }));
import { onSocialNotificationCreated } from '../../functions/src/pushTriggers';
const send = () => onSocialNotificationCreated.run({ data: { id: 'synthetic-ping', data: () => ({ user_id: 'legacy-profile-alice', recipientUid: 'forged-bob', title: 'Ready', type: 'smart_ping' }) } } as Parameters<typeof onSocialNotificationCreated.run>[0]);
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); state.context.mockResolvedValue({ ownerUid: 'alice', profileId: 'canonical-alice', preferences: { brief_pings_enabled: true } }); });
afterEach(() => vi.restoreAllMocks());
it('binds the delivered mute action to the current verified recipient UID, not a caller field', async () => {
  await send(); expect(state.push).toHaveBeenCalledWith('canonical-alice', expect.objectContaining({ data: expect.objectContaining({ recipientUid: 'alice' }) }));
});
it.each([{ brief_pings_enabled: false }, { brief_pings_enabled: true, brief_muted_until: Number.MAX_SAFE_INTEGER }])('does not invoke providers for suppressed smart pings: %j', async preferences => {
  state.context.mockResolvedValue({ ownerUid: 'alice', profileId: 'canonical-alice', preferences }); await send(); expect(state.push).not.toHaveBeenCalled();
});
it('does not invoke providers when identity or preferences cannot be read', async () => {
  state.context.mockRejectedValue(new Error('Unverified identity')); await send(); expect(state.push).not.toHaveBeenCalled();
});
