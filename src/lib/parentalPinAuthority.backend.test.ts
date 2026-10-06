// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  let tail = Promise.resolve();
  const ref = (id: string) => ({ id, get: async () => ({ id: id.split('/').at(-1), exists: rows.has(id), data: () => structuredClone(rows.get(id)) }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => { rows.set(id, { ...(options?.merge ? rows.get(id) : {}), ...structuredClone(data) }); } });
  const query = (collection: string, filters: Array<[string, string, unknown]> = [], max = 99): any => ({
    where: (field: string, op: string, value: unknown) => query(collection, [...filters, [field, op, value]], max), limit: (size: number) => query(collection, filters, size),
    get: async () => { const docs = [...rows.entries()].filter(([key, row]) => key.startsWith(`${collection}/`) && filters.every(([field, op, value]) => op === 'in' ? (value as unknown[]).includes(row[field]) : row[field] === value)).slice(0, max).map(([key]) => ({ id: key.split('/').at(-1), exists: true, data: () => structuredClone(rows.get(key)) })); return { docs, size: docs.length, empty: !docs.length }; },
  });
  const db = { doc: ref, collection: (collection: string) => ({ ...query(collection), doc: (id: string) => ref(`${collection}/${id}`) }),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = tail.then(() => run({ get: (target: ReturnType<typeof ref>) => target.get(), getAll: (...targets: ReturnType<typeof ref>[]) => Promise.all(targets.map(target => target.get())), set: (target: ReturnType<typeof ref>, data: Record<string, unknown>, options?: { merge?: boolean }) => target.set(data, options) }));
      tail = result.then(() => undefined, () => undefined); return result;
    } };
  return { rows, db, user: { uid: 'alice', disabled: false, metadata: { creationTime: '2026-01-01T00:00:00.000Z' }, tokensValidAfterTime: '2026-01-01T00:00:00.000Z' }, getUser: vi.fn() };
});
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: fixture.db, auth: { getUser: fixture.getUser },
  requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' }); return request.auth.uid; } }));
import { getParentalControlsSafe, setParentalPin, updateParentalControls, verifyParentalPin } from '../../functions/src/parental';

const path = 'parental_controls/alice';
const salt = '0123456789abcdef0123456789abcdef';
const seed = (extra = {}) => fixture.rows.set(path, { user_id: 'alice', authority_version: 1, profile_id: 'profile-alice', auth_created_at_ms: Date.parse('2026-01-01T00:00:00Z'), binding_revision: 'a'.repeat(48), is_active: true, content_filter_level: 'protected', max_screen_time_minutes: 120,
  allowed_features: ['feed', 'profile'], pin_hash: createHash('sha256').update(`${salt}:1234`).digest('hex'), pin_salt: salt, pin_algo: 'sha256-v1',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...extra });
const request = (data: Record<string, unknown>, uid = 'alice') => {
  const payload: Record<string, unknown> = { expectedOwnerUid: uid, expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse('2026-01-01T00:00:00Z'), ...data };
  if (process.env.PARENTAL_SETUP_BASELINE === '1') delete payload.requestId;
  return { auth: { uid, token: { auth_time: Date.parse('2026-01-02T00:00:00Z') / 1000 } }, data: payload } as never;
};
const pinRequest = (data: Record<string, unknown>) => request({ requestId: '22222222-2222-4222-8222-222222222222', ...data });
const before = () => structuredClone(fixture.rows.get(path));
beforeEach(() => { fixture.rows.clear(); fixture.user.disabled = false; fixture.user.metadata.creationTime = '2026-01-01T00:00:00.000Z'; fixture.user.tokensValidAfterTime = '2026-01-01T00:00:00.000Z'; fixture.getUser.mockReset().mockImplementation(async () => structuredClone(fixture.user)); fixture.rows.set('profiles/profile-alice', { user_id: 'alice' }); fixture.rows.set('_account_profile_bindings/alice', { version: 1, owner_uid: 'alice', profile_id: 'profile-alice', auth_created_at_ms: Date.parse('2026-01-01T00:00:00Z'), revision: 'a'.repeat(48), status: 'active' }); seed(); });

describe('actual parental callable PIN authorization', () => {
  it('requires the current PIN to replace an existing PIN', async () => {
    const original = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fixture.rows.get(path)?.pin_hash).toBe(original?.pin_hash);
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).resolves.toMatchObject({ ok: true });
  });
  it('rejects a wrong current PIN without resetting the existing PIN', async () => {
    const original = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678', currentPin: '9999' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fixture.rows.get(path)?.pin_hash).toBe(original?.pin_hash);
  });
  it('requires PIN proof on direct settings requests', async () => {
    await expect(updateParentalControls.run(request({ updates: { is_active: false } }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fixture.rows.get(path)?.is_active).toBe(true);
  });
  it('rejects secret/ownership/timestamp fields rather than silently accepting a partial update', async () => {
    for (const updates of [{ user_id: 'bob' }, { pin_hash: 'injected' }, { created_at: 'now' }, { unreviewed_field: true }]) {
      const original = before();
      await expect(updateParentalControls.run(request({ pin: '1234', updates }))).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(before()).toEqual(original);
    }
  });
  it('validates settings types and bounds', async () => {
    for (const updates of [{ is_active: 'false' }, { max_screen_time_minutes: -1 }, { max_screen_time_minutes: 2.5 }, { content_filter_level: 'anything' }, { allowed_features: ['../other'] }]) {
      await expect(updateParentalControls.run(request({ pin: '1234', updates }))).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    expect(fixture.rows.get(path)?.is_active).toBe(true);
  });
  it('accepts a correct PIN for updates and preserves secret material and creation time', async () => {
    const original = before();
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { max_screen_time_minutes: 60 } }))).resolves.toMatchObject({ ok: true });
    expect(fixture.rows.get(path)).toMatchObject({ max_screen_time_minutes: 60, pin_hash: original?.pin_hash, created_at: original?.created_at });
  });
  it('keeps legacy PINs valid and rotates them only with correct proof', async () => {
    await expect(setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }))).resolves.toMatchObject({ ok: true });
    expect(fixture.rows.get(path)?.pin_algo).toBe('scrypt-v2');
    await expect(verifyParentalPin.run(request({ pin: '5678' }))).resolves.toMatchObject({ ok: true });
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).resolves.toMatchObject({ ok: false });
  });
  it('creates controls on first setup and never exposes secrets in the response', async () => {
    fixture.rows.delete(path);
    const result = await setParentalPin.run(pinRequest({ pin: '1234' }));
    expect(result).toMatchObject({ ok: true, controls: { has_pin: true, is_active: true } });
    expect(JSON.stringify(result)).not.toMatch(/pin_hash|pin_salt|pin_failures|pin_lock_until/);
  });
  it('returns a whitelist, not arbitrary private server fields', async () => {
    seed({ private_note: 'not-for-clients', pin_failures: 2, pin_lock_until: 0 });
    const result = await getParentalControlsSafe.run(request({}));
    expect(result).toMatchObject({ controls: { has_pin: true } });
    expect(JSON.stringify(result)).not.toMatch(/private_note|pin_hash|pin_salt|pin_failures|pin_lock_until/);
  });
  it('does not overwrite a contradictory ownership row', async () => {
    seed({ user_id: 'bob' }); const original = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(before()).toEqual(original);
  });
  it('persists a shared lockout across verification and mutation requests', async () => {
    for (let i = 0; i < 5; i++) await expect(verifyParentalPin.run(request({ pin: '9999' }))).resolves.toMatchObject({ ok: false });
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(fixture.rows.get(path)?.is_active).toBe(true);
  });
  it('counts concurrent wrong guesses without lost updates', async () => {
    await Promise.all(Array.from({ length: 5 }, () => verifyParentalPin.run(request({ pin: '9999' }))));
    expect(fixture.rows.get(path)?.pin_failures).toBe(5);
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('rejects requests captured for another account without changing PIN attempts', async () => {
    const original = before();
    for (const target of [setParentalPin, updateParentalControls, verifyParentalPin]) {
      await expect(target.run(request({ expectedOwnerUid: 'bob', pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'failed-precondition' });
    }
    expect(before()).toEqual(original);
  });
  it('does not replace explicit nullable preferences when rotating a PIN', async () => {
    seed({ max_screen_time_minutes: null, allowed_features: null });
    await setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }));
    expect(before()).toMatchObject({ max_screen_time_minutes: null, allowed_features: null });
  });
  it('rejects disabled and recreated Auth accounts without reading out or changing controls', async () => {
    const original = before(); fixture.user.disabled = true;
    await expect(getParentalControlsSafe.run(request({}))).rejects.toMatchObject({ code: 'failed-precondition' });
    fixture.user.disabled = false; fixture.user.metadata.creationTime = '2026-02-01T00:00:00Z';
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(original);
  });
  it('rejects revoked credentials and requests captured for an older profile', async () => {
    const original = before(); fixture.user.tokensValidAfterTime = '2026-01-03T00:00:00Z';
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).rejects.toMatchObject({ code: 'unauthenticated' });
    fixture.user.tokensValidAfterTime = '2026-01-01T00:00:00Z';
    await expect(verifyParentalPin.run(request({ pin: '1234', expectedProfileId: 'other-profile' }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(original);
  });
  it('rechecks Auth after transactional identity resolution before a write', async () => {
    const original = before(); fixture.getUser.mockResolvedValueOnce(structuredClone(fixture.user)).mockResolvedValue({ ...fixture.user, disabled: true });
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(original);
  });
  it('requires the protected current binding and unambiguous canonical profile', async () => {
    const original = before(); fixture.rows.set('profiles/duplicate', { user_id: 'alice' });
    await expect(getParentalControlsSafe.run(request({}))).rejects.toMatchObject({ code: 'failed-precondition' });
    fixture.rows.delete('profiles/duplicate'); fixture.rows.get('_account_profile_bindings/alice')!.status = 'retired';
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(original);
  });
  it('preserves unbound legacy and retired-incarnation controls instead of adopting them', async () => {
    seed({ authority_version: undefined }); const original = before();
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(original);
    seed({ auth_created_at_ms: Date.parse('2025-01-01T00:00:00Z') }); const retired = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(retired);
  });
  it('does not create a second PIN row over profile-alias or differently keyed historical controls', async () => {
    const original = before(); fixture.rows.delete(path); fixture.rows.set('parental_controls/legacy-id', original!);
    await expect(setParentalPin.run(pinRequest({ pin: '5678' }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toBeUndefined();
    fixture.rows.delete('parental_controls/legacy-id'); fixture.rows.set('parental_controls/profile-alice', { ...original, user_id: 'profile-alice' });
    await expect(getParentalControlsSafe.run(request({}))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toBeUndefined();
  });
  it('returns an unavailable error on Auth transport failure without changing saved controls', async () => {
    const original = before(); fixture.getUser.mockRejectedValue(new Error('Network'));
    await expect(updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } }))).rejects.toMatchObject({ code: 'unavailable' }); expect(before()).toEqual(original);
  });

  it('confirms the same committed setup retry without rotating its PIN or resetting settings', async () => {
    fixture.rows.delete(path); const call = request({ pin: '5678', requestId: '11111111-1111-4111-8111-111111111111', settings: { max_screen_time_minutes: 90 } });
    await setParentalPin.run(call); const saved = before();
    await expect(setParentalPin.run(call)).resolves.toMatchObject({ ok: true, replayed: true }); expect(before()).toEqual(saved);
  });
  it('allows concurrent identical first-setup requests to converge on one PIN material', async () => {
    fixture.rows.delete(path); const call = request({ pin: '5678', requestId: '11111111-1111-4111-8111-111111111111' });
    const results = await Promise.all([setParentalPin.run(call), setParentalPin.run(call)]);
    expect(results.map(result => result.replayed)).toEqual([false, true]); expect(before()?.pin_failures).toBe(0);
  });
  it('does not replay an old setup after a later control change', async () => {
    fixture.rows.delete(path); const call = request({ pin: '5678', requestId: '11111111-1111-4111-8111-111111111111' }); await setParentalPin.run(call);
    await updateParentalControls.run(request({ pin: '5678', updates: { max_screen_time_minutes: 30 } })); const changed = before();
    await expect(setParentalPin.run(call)).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(changed);
  });

  it('rejects altered details for a committed setup request without changing the saved controls', async () => {
    fixture.rows.delete(path); await setParentalPin.run(pinRequest({ pin: '5678', settings: { max_screen_time_minutes: 90 } })); const saved = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678', settings: { max_screen_time_minutes: 30 } }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(saved);
  });
  it('shares the PIN guess limit on receipt retries and blocks correct replay during lockout', async () => {
    fixture.rows.delete(path); await setParentalPin.run(pinRequest({ pin: '5678' }));
    for (let i = 0; i < 5; i++) await expect(setParentalPin.run(pinRequest({ pin: '9999' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(before()?.pin_failures).toBe(5); await expect(setParentalPin.run(pinRequest({ pin: '5678' }))).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('confirms the same PIN rotation retry without needing the now-retired old PIN again', async () => {
    const call = pinRequest({ pin: '5678', currentPin: '1234' }); await setParentalPin.run(call); const saved = before();
    await expect(setParentalPin.run(call)).resolves.toMatchObject({ replayed: true }); expect(before()).toEqual(saved);
  });
  it('rejects a malformed private receipt and never returns receipt secrets', async () => {
    fixture.rows.delete(path); const result = await setParentalPin.run(pinRequest({ pin: '5678' }));
    expect(JSON.stringify(result)).not.toMatch(/nonce|fingerprint|pin_version|control_revision|pin_hash|pin_salt/);
    const key = [...fixture.rows.keys()].find(key => key.startsWith('_parental_pin_receipts/'))!;
    fixture.rows.get(key)!.nonce = 'corrupt'; const saved = before();
    await expect(setParentalPin.run(pinRequest({ pin: '5678' }))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(before()).toEqual(saved);
  });
  it('requires a valid setup request ID before making any change', async () => {
    const saved = before(); for (const requestId of [undefined, 'bad-id']) await expect(setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234', requestId }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(before()).toEqual(saved);
  });

});
