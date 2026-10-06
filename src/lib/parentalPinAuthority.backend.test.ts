// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  let tail = Promise.resolve();
  const ref = (id: string) => ({ id, get: async () => ({ exists: rows.has(id), data: () => structuredClone(rows.get(id)) }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => { rows.set(id, { ...(options?.merge ? rows.get(id) : {}), ...structuredClone(data) }); } });
  const db = { collection: (collection: string) => ({ doc: (id: string) => ref(`${collection}/${id}`) }),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = tail.then(() => run({ get: (target: ReturnType<typeof ref>) => target.get(), set: (target: ReturnType<typeof ref>, data: Record<string, unknown>, options?: { merge?: boolean }) => target.set(data, options) }));
      tail = result.then(() => undefined, () => undefined); return result;
    } };
  return { rows, db };
});
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: fixture.db,
  requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' }); return request.auth.uid; } }));
import { getParentalControlsSafe, setParentalPin, updateParentalControls, verifyParentalPin } from '../../functions/src/parental';

const path = 'parental_controls/alice';
const salt = '0123456789abcdef0123456789abcdef';
const seed = (extra = {}) => fixture.rows.set(path, { user_id: 'alice', is_active: true, content_filter_level: 'protected', max_screen_time_minutes: 120,
  allowed_features: ['feed', 'profile'], pin_hash: createHash('sha256').update(`${salt}:1234`).digest('hex'), pin_salt: salt, pin_algo: 'sha256-v1',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...extra });
const request = (data: Record<string, unknown>, uid = 'alice') => ({ auth: { uid, token: {} }, data: { expectedOwnerUid: uid, ...data } } as never);
const before = () => structuredClone(fixture.rows.get(path));
beforeEach(() => { fixture.rows.clear(); seed(); });

describe('actual parental callable PIN authorization', () => {
  it('requires the current PIN to replace an existing PIN', async () => {
    const original = before();
    await expect(setParentalPin.run(request({ pin: '5678' }))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fixture.rows.get(path)?.pin_hash).toBe(original?.pin_hash);
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).resolves.toMatchObject({ ok: true });
  });
  it('rejects a wrong current PIN without resetting the existing PIN', async () => {
    const original = before();
    await expect(setParentalPin.run(request({ pin: '5678', currentPin: '9999' }))).rejects.toMatchObject({ code: 'permission-denied' });
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
    await expect(setParentalPin.run(request({ pin: '5678', currentPin: '1234' }))).resolves.toMatchObject({ ok: true });
    expect(fixture.rows.get(path)?.pin_algo).toBe('scrypt-v2');
    await expect(verifyParentalPin.run(request({ pin: '5678' }))).resolves.toMatchObject({ ok: true });
    await expect(verifyParentalPin.run(request({ pin: '1234' }))).resolves.toMatchObject({ ok: false });
  });
  it('creates controls on first setup and never exposes secrets in the response', async () => {
    fixture.rows.delete(path);
    const result = await setParentalPin.run(request({ pin: '1234' }));
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
    await expect(setParentalPin.run(request({ pin: '5678', currentPin: '1234' }))).rejects.toMatchObject({ code: 'failed-precondition' });
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
    await setParentalPin.run(request({ pin: '5678', currentPin: '1234' }));
    expect(before()).toMatchObject({ max_screen_time_minutes: null, allowed_features: null });
  });
});
