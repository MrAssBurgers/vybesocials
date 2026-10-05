import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), auth: { currentUser: { uid: 'alice' } as { uid: string } | null, onAuthStateChanged: vi.fn() }, changed: null as null | ((user: { uid: string } | null) => void) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
import { checkedNotificationPreferences, notificationBooleanKeys, notificationPreferenceAttempt, notificationPreferenceRequest, muteSmartPingsForOneHour } from './notificationPreferenceService';
const actor = { uid: 'alice', profileId: 'profile-alice' };
const receipt = () => ({ ok: true, ownerUid: actor.uid, profileId: actor.profileId, revision: 'a'.repeat(64), values: { ...Object.fromEntries(notificationBooleanKeys.map(key => [key, true])), quiet_hours_start: null, quiet_hours_end: null, smart_ping_radius_miles: 5, smart_ping_max_per_day: 6 } });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.auth.currentUser = { uid: 'alice' }; state.auth.onAuthStateChanged.mockImplementation(callback => { state.changed = callback; return () => {}; }); });
it('derives account bindings and accepts only a complete saved state', async () => {
  state.invoke.mockResolvedValue({ data: receipt(), error: null }); const result = await notificationPreferenceRequest(actor, { action: 'read' });
  expect(state.invoke).toHaveBeenCalledWith('manage-notification-preferences', { action: 'read', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice' }); expect(result.preferences.user_id).toBe(actor.profileId);
});
it.each(['ownerUid', 'profileId', 'revision', 'ok'])('rejects an invalid %s receipt', field => { expect(() => checkedNotificationPreferences({ ...receipt(), [field]: 'invalid' }, actor)).toThrow(/not confirmed/); });
it.each([{ likes_enabled: 'false' }, { quiet_hours_start: '24:01' }, { smart_ping_max_per_day: 25 }, { smart_ping_radius_miles: 1.5 }, { dms_enabled: undefined }])('rejects malformed preference values', values => { const value = receipt(); expect(() => checkedNotificationPreferences({ ...value, values: { ...value.values, ...values } }, actor)).toThrow(/invalid response/); });
it('preserves structured errors for revision conflict recovery', async () => { state.invoke.mockResolvedValue({ data: null, error: { message: 'Changed elsewhere', code: 'aborted' } }); await expect(notificationPreferenceRequest(actor, { action: 'read' })).rejects.toMatchObject({ code: 'aborted', message: 'Changed elsewhere' }); });
it('uses the real account epoch guard to reject A-B-A responses', async () => {
  state.invoke.mockImplementation(async () => { state.auth.currentUser = { uid: 'bob' }; state.changed?.(state.auth.currentUser); state.auth.currentUser = { uid: 'alice' }; state.changed?.(state.auth.currentUser); return { data: receipt(), error: null }; });
  await expect(notificationPreferenceRequest(actor, { action: 'read' })).rejects.toMatchObject({ code: 'account-changed' });
});
it('retains retry identity through reload storage and separates revisions/accounts/choices', () => {
  const revision = 'b'.repeat(64), first = notificationPreferenceAttempt(actor, 'likes_enabled', false, revision);
  expect(notificationPreferenceAttempt(actor, 'likes_enabled', false, revision).requestId).toBe(first.requestId);
  expect(notificationPreferenceAttempt(actor, 'likes_enabled', true, revision).requestId).not.toBe(first.requestId);
  expect(notificationPreferenceAttempt({ uid: 'bob', profileId: 'profile-bob' }, 'likes_enabled', false, revision).requestId).not.toBe(first.requestId);
  expect(notificationPreferenceAttempt(actor, 'likes_enabled', false, 'c'.repeat(64)).requestId).not.toBe(first.requestId);
  expect(sessionStorage.getItem('vybe-notification-preference-attempts-v1')).toContain(first.requestId); first.complete();
  expect(notificationPreferenceAttempt(actor, 'likes_enabled', false, revision).requestId).not.toBe(first.requestId);
});
it('retains both mute revision and request identity after a lost response without starting another hour', async () => {
  const muted = { ...receipt(), revision: 'b'.repeat(64), values: { ...receipt().values, brief_muted_until: Date.now() + 3600000 } };
  state.invoke.mockResolvedValueOnce({ data: receipt(), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Lost acknowledgement' } });
  await expect(muteSmartPingsForOneHour(actor)).rejects.toThrow('Lost acknowledgement');
  const original = state.invoke.mock.calls[1][1];
  expect(original).toMatchObject({ hours: 1, revision: 'a'.repeat(64), expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice' });
  expect(sessionStorage.getItem('vybe-notification-mute-attempts-v1')).toContain(original.requestId);
  state.invoke.mockResolvedValueOnce({ data: muted, error: null });
  expect((await muteSmartPingsForOneHour(actor)).preferences.brief_muted_until).toBe(muted.values.brief_muted_until);
  expect(state.invoke.mock.calls[2]).toEqual(['mute-smart-pings', original]);
  expect(state.invoke).toHaveBeenCalledTimes(3);
});
it('surfaces mute revision conflict without reading and overwriting newer settings automatically', async () => {
  state.invoke.mockResolvedValueOnce({ data: receipt(), error: null }).mockResolvedValueOnce({ data: null, error: { code: 'aborted', message: 'Changed on another device' } });
  await expect(muteSmartPingsForOneHour(actor)).rejects.toMatchObject({ code: 'aborted' }); expect(state.invoke).toHaveBeenCalledTimes(2);
});
it('rejects malformed protected timed mute expiry and defaults old receipts to no timed mute', () => {
  expect(checkedNotificationPreferences(receipt(), actor).preferences.brief_muted_until).toBeNull();
  expect(() => checkedNotificationPreferences({ ...receipt(), values: { ...receipt().values, brief_muted_until: 'forever' } }, actor)).toThrow(/invalid response/);
});
