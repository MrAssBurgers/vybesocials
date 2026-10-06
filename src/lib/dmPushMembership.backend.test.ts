// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  members: [] as Record<string, unknown>[], legacy: [] as string[],
  push: vi.fn(), preferences: vi.fn(), gate: vi.fn(),
}));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: {
  collection: (name: string) => {
    if (name === 'profiles') return { doc: (id: string) => ({ get: async () => ({
      exists: true, id, data: () => ({ user_id: `uid-${id}`, display_name: id }),
    }) }) };
    if (name === 'conversations') return { doc: () => ({ get: async () => ({
      exists: true, data: () => ({ member_ids: state.legacy }),
    }) }) };
    if (name === 'conversation_members') return { where: () => ({ get: async () => ({
      docs: state.members.map(row => ({ data: () => row })),
    }) }) };
    throw new Error(`Unexpected collection ${name}`);
  },
} }));
vi.mock('../../functions/src/_shared/fcmPush.js', () => ({ dispatchDmPushToProfile: state.push, dispatchCallPushToProfile: vi.fn(), messagePreview: () => 'Synthetic message' }));
vi.mock('../../functions/src/_shared/onesignalPush.js', () => ({ resolvePushTargetProfileId: async (id: string) => id }));
vi.mock('../../functions/src/_shared/pushPreferences.js', () => ({ loadNotificationPreferences: state.preferences, isBlockedByQuietHours: () => false, isPushAllowedForType: () => true, sanitizeDmPushBody: (body: string) => body }));
vi.mock('../../functions/src/_shared/notificationPreferenceAuthority.js', () => ({ readDeliveryNotificationContext: vi.fn() }));
vi.mock('../../functions/src/_shared/smartPushGate.js', () => ({ logPushDelivery: vi.fn(), shouldSkipRecipientPush: state.gate }));
import { onDmMessageCreated, onConversationMessageCreated } from '../../functions/src/pushTriggers';

beforeEach(() => {
  vi.clearAllMocks(); state.members = []; state.legacy = ['alice', 'bob'];
  state.preferences.mockResolvedValue({ dms_enabled: true });
  state.gate.mockResolvedValue({ skip: false }); state.push.mockResolvedValue({ sent: 1 });
});
for (const [name, handler] of [['flat', onDmMessageCreated], ['nested', onConversationMessageCreated]] as const) {
  const send = () => handler.run({ params: { cid: 'alice_bob' }, data: { id: 'synthetic-message', data: () => ({ sender_id: 'alice', conversation_id: 'alice_bob' }) } } as Parameters<typeof handler.run>[0]);
  it(`${name}: muted membership never falls back to legacy participants or the conversation ID`, async () => {
    state.members = [{ user_id: 'alice' }, { user_id: 'bob', is_muted: true }];
    await send(); expect(state.push).not.toHaveBeenCalled(); expect(state.preferences).not.toHaveBeenCalled();
  });
  it(`${name}: existing membership without eligible recipients never invents a recipient`, async () => {
    state.members = [{ user_id: 'alice' }];
    await send(); expect(state.push).not.toHaveBeenCalled();
  });
  it(`${name}: only eligible current members receive push`, async () => {
    state.members = [{ user_id: 'alice' }, { user_id: 'bob', is_muted: true }, { user_id: 'carol', is_muted: false }];
    await send(); expect(state.push).toHaveBeenCalledTimes(1); expect(state.push).toHaveBeenCalledWith('carol', expect.anything());
  });
  it(`${name}: retains the existing empty-membership legacy path`, async () => {
    await send(); expect(state.push).toHaveBeenCalledTimes(1); expect(state.push).toHaveBeenCalledWith('bob', expect.anything());
  });
}
