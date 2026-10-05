import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), docs: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ collectionRef: (name: string) => name }));
vi.mock('firebase/firestore', () => ({ getDocsFromServer: mock.docs, query: (...args: unknown[]) => args, where: (...args: unknown[]) => ['where', ...args], orderBy: (...args: unknown[]) => ['order', ...args], limit: (n: number) => ['limit', n], documentId: () => '__name__', startAfter: (doc: unknown) => ['after', doc] }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Account changed'); }; } }));
import { readSignInPreferences, updateSignInPreference, readSecurityDevices, readSecurityHistory, revokeAllSecuritySessions } from './securitySettingsService';
const preferences = () => ({ ok: true, ownerUid: 'alice', settings: { email_2fa_enabled: true, login_approvals_enabled: false }, revision: '10:20', capabilities: { enableEmailConfirmation: false, enableLoginApprovals: false } });
const receipt = () => ({ ok: true, ownerUid: 'alice', requestId: 'request', authTime: 123, scope: 'all-refresh-tokens', revokedBefore: new Date().toISOString(), trackedSessionsMarked: 2, existingAccessMayContinue: true });
const doc = (id: string, values = {}) => ({ id, ref: { parent: { id: 'user_sessions' } }, data: () => ({ user_id: 'alice', revoked_at: null, ...values }) });
beforeEach(() => { vi.resetAllMocks(); mock.uid = 'alice'; mock.epoch++; mock.invoke.mockResolvedValue({ data: preferences(), error: null }); mock.docs.mockResolvedValue({ docs: [] }); });
it('checks canonical owner and strict booleans instead of coercing cached flags', async () => {
  expect(await readSignInPreferences('alice')).toMatchObject({ settings: { email_2fa_enabled: true }, revision: '10:20' });
  expect(mock.invoke).toHaveBeenCalledWith('manage-sign-in-preferences', { action: 'read', expectedOwnerUid: 'alice' });
  for (const data of [{ ...preferences(), ownerUid: 'bob' }, { ...preferences(), settings: { email_2fa_enabled: 'false', login_approvals_enabled: false } }, { ...preferences(), capabilities: null }, { ...preferences(), revision: '' }]) {
    mock.invoke.mockResolvedValueOnce({ data, error: null }); await expect(readSignInPreferences('alice')).rejects.toThrow('could not be confirmed');
  }
});
it('preserves callable failures without falling back to a default or a raw write', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { code: 'functions/aborted', message: 'Refresh before saving' } });
  await expect(readSignInPreferences('alice')).rejects.toMatchObject({ message: 'Refresh before saving', code: 'functions/aborted' });
  expect(mock.docs).not.toHaveBeenCalled();
});
it('sends one revision-bound patch and requires a matching applied receipt', async () => {
  const current = await readSignInPreferences('alice');
  const saved = { ...preferences(), settings: { email_2fa_enabled: false, login_approvals_enabled: false }, requestId: 'request', phase: 'applied' };
  mock.invoke.mockResolvedValue({ data: saved, error: null });
  expect((await updateSignInPreference('alice', current, 'email_2fa_enabled', false, 'request')).settings.email_2fa_enabled).toBe(false);
  expect(mock.invoke).toHaveBeenLastCalledWith('manage-sign-in-preferences', { action: 'update', expectedOwnerUid: 'alice', expectedRevision: '10:20', requestId: 'request', patch: { email_2fa_enabled: false } });
  for (const data of [{ ...saved, requestId: 'other' }, { ...saved, phase: 'superseded' }, { ...saved, settings: preferences().settings }]) {
    mock.invoke.mockResolvedValueOnce({ data, error: null }); await expect(updateSignInPreference('alice', current, 'email_2fa_enabled', false, 'request')).rejects.toThrow('changed');
  }
});
it('rejects settings and session results after an away-and-back account change', async () => {
  mock.invoke.mockImplementation(async () => { mock.epoch += 2; return { data: preferences(), error: null }; });
  await expect(readSignInPreferences('alice')).rejects.toThrow('Account changed');
  mock.docs.mockImplementation(async () => { mock.epoch += 2; return { docs: [doc('one')] }; });
  await expect(readSecurityDevices('alice')).rejects.toThrow('Account changed');
});
it('uses server-only owner queries, real document IDs, safe dates and all device pages', async () => {
  const docs = Array.from({ length: 51 }, (_, i) => doc(String(i), { id: 'spoofed', last_seen_at: 'invalid' }));
  mock.docs.mockResolvedValueOnce({ docs });
  const first = await readSecurityDevices('alice'); expect(first.devices).toHaveLength(50); expect(first.devices[0]).toMatchObject({ id: '0', lastSeenAt: null }); expect(first.cursor?.id).toBe('49');
  mock.docs.mockResolvedValueOnce({ docs: [docs[50]] });
  const second = await readSecurityDevices('alice', undefined, first.cursor!); expect(second.devices[0].id).toBe('50'); expect(second.cursor).toBeNull();
  expect(mock.docs.mock.calls[1][0]).toEqual(expect.arrayContaining([['where', 'user_id', '==', 'alice'], ['after', first.cursor]]));
});
it('rejects foreign rows and foreign device cursors rather than exposing them', async () => {
  mock.docs.mockResolvedValue({ docs: [doc('one', { user_id: 'bob' })] });
  await expect(readSecurityDevices('alice')).rejects.toThrow(); await expect(readSecurityHistory('alice')).rejects.toThrow();
  mock.docs.mockClear(); await expect(readSecurityDevices('alice', undefined, doc('other', { user_id: 'bob' }) as never)).rejects.toThrow(); expect(mock.docs).not.toHaveBeenCalled();
});
it('does not turn history errors into empty results or malformed success into a successful login', async () => {
  mock.docs.mockRejectedValueOnce(new Error('network')); await expect(readSecurityHistory('alice')).rejects.toThrow('network');
  mock.docs.mockResolvedValueOnce({ docs: [doc('history', { created_at: 'bad', success: 'true' })] });
  expect(await readSecurityHistory('alice')).toEqual([expect.objectContaining({ createdAt: null, success: null })]);
});
it('requires the explicit account-wide receipt before permitting local sign-out', async () => {
  mock.invoke.mockResolvedValue({ data: receipt(), error: null }); expect((await revokeAllSecuritySessions('alice', 'request', 123)).trackedSessionsMarked).toBe(2);
  expect(mock.invoke).toHaveBeenLastCalledWith('auth-session-revoke', { all: true, confirmation: 'all-devices', expectedOwnerUid: 'alice', expectedAuthTime: 123, requestId: 'request' });
  for (const data of [{ ok: true }, { ...receipt(), ownerUid: 'bob' }, { ...receipt(), requestId: 'other' }, { ...receipt(), scope: 'one-device' }, { ...receipt(), existingAccessMayContinue: false }, { ...receipt(), revokedBefore: 'invalid' }, { ...receipt(), trackedSessionsMarked: 201 }]) {
    mock.invoke.mockResolvedValueOnce({ data, error: null }); await expect(revokeAllSecuritySessions('alice', 'request', 123)).rejects.toThrow('could not be confirmed');
  }
});
