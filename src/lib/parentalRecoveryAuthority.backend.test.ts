// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prepareParentalRecovery, applyReviewedParentalRecovery } from '../../functions/src/_shared/parentalRecoveryAuthority';
const rows = new Map<string, Record<string, unknown>>();
const users = new Map<string, any>();
const versions = new Map<string, number>();
const ref = (path: string): any => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
const snapshot = (path: string): any => ({ id: path.split('/').at(-1), exists: rows.has(path), ref: ref(path), data: () => structuredClone(rows.get(path)),
  createTime: { nanoseconds: 0, toDate: () => new Date('2026-01-02T00:00:00Z') }, updateTime: { nanoseconds: versions.get(path) ?? 0, toDate: () => new Date('2026-01-02T00:00:00Z') } });
const query = (collection: string, filters: any[] = [], size = 99): any => ({ where: (key: string, op: string, value: unknown) => query(collection, [...filters, [key, op, value]], size), limit: (max: number) => query(collection, filters, max), get: async () => {
  const docs = [...rows.entries()].filter(([path, row]) => path.startsWith(collection + '/') && filters.every(([key, op, value]) => op === 'in' ? value.includes(row[key]) : value === row[key])).slice(0, size).map(([path]) => snapshot(path)); return { docs, size: docs.length, empty: !docs.length };
} });
const database: any = { doc: ref, collection: (name: string) => ({ ...query(name), doc: (id: string) => ref(name + '/' + id) }), runTransaction: async (run: any) => {
  const writes: any[] = []; const result = await run({ get: (target: any) => target.get(), getAll: (...targets: any[]) => Promise.all(targets.map(target => target.get())),
    create: (target: any, data: any) => { if (rows.has(target.path)) throw new Error('Already exists'); writes.push(['set', target.path, structuredClone(data)]); },
    set: (target: any, data: any) => writes.push(['set', target.path, structuredClone(data)]), delete: (target: any) => writes.push(['delete', target.path]) });
  for (const [action, path, data] of writes) { if (action === 'delete') rows.delete(path); else rows.set(path, data); versions.set(path, (versions.get(path) ?? 0) + 1); } return result;
} };
const auth: any = { getUser: async (uid: string) => { if (!users.has(uid)) throw Object.assign(new Error('Absent'), { code: 'auth/user-not-found' }); return structuredClone(users.get(uid)); } };
const salt = '0123456789abcdef0123456789abcdef', created = Date.parse('2026-01-01T00:00:00Z');
const row = () => ({ user_id: 'profile-alice', is_active: true, content_filter_level: 'protected', max_screen_time_minutes: 120, allowed_features: ['feed'],
  pin_salt: salt, pin_hash: createHash('sha256').update(salt + ':1234').digest('hex'), pin_algo: 'sha256-v1', pin_failures: 3, pin_lock_until: 0, created_at: '2020-01-01', private_note: 'retain' });
const prepare = () => prepareParentalRecovery(database, auth, 'alice', 'profile-alice', 'legacy', 'independently-reviewed-case');
const apply = (plan: any) => applyReviewedParentalRecovery(database, auth, plan, 'reviewer', 'independently-reviewed-case');
beforeEach(() => {
  rows.clear(); users.clear(); versions.clear();
  users.set('alice', { uid: 'alice', disabled: false, metadata: { creationTime: '2026-01-01T00:00:00Z' } });
  users.set('reviewer', { uid: 'reviewer', disabled: false, metadata: { creationTime: '2025-01-01T00:00:00Z' }, customClaims: { admin: true } });
  rows.set('profiles/profile-alice', { user_id: 'alice' }); rows.set('_account_profile_bindings/alice', { version: 1, status: 'active', owner_uid: 'alice', profile_id: 'profile-alice', auth_created_at_ms: created, revision: 'a'.repeat(48) }); rows.set('parental_controls/legacy', row());
});
describe('trusted operator parental ownership recovery', () => {
  it('prepares a read-only private plan without PIN material or automatic approval', async () => {
    const original = structuredClone([...rows]); const plan = await prepare(); expect([...rows]).toEqual(original);
    expect(plan.status).toBe('review-required'); expect(JSON.stringify(plan)).not.toMatch(/pin_hash|pin_salt|private_note/);
  });
  it('preserves the entire source, PIN, preferences and attempt state while binding the canonical target', async () => {
    const original = structuredClone(row()); const plan = await prepare(); await expect(apply(plan)).resolves.toEqual({ ok: true, replayed: false });
    const controls = rows.get('parental_controls/alice'); expect(controls).toMatchObject({ ...original, user_id: 'alice', profile_id: 'profile-alice', auth_created_at_ms: created, binding_revision: 'a'.repeat(48) });
    expect(rows.has('parental_controls/legacy')).toBe(false);
    const archived = [...rows].find(([path]) => path.startsWith('_parental_controls_archive/'))![1]; expect(archived.source_row).toEqual(original);
  });
  it('replays a lost result without rewriting the target or resetting failed attempts', async () => {
    const plan = await prepare(); await apply(plan); const target = rows.get('parental_controls/alice')!; target.pin_failures = 5; target.pin_lock_until = Date.now() + 30000;
    const current = structuredClone([...rows]); await expect(apply(plan)).resolves.toEqual({ ok: true, replayed: true }); expect([...rows]).toEqual(current);
  });
  it.each(['pin_hash', 'content_filter_level', 'private_note'])('rejects a stale plan when source %s changes', async field => {
    const plan = await prepare(); rows.get('parental_controls/legacy')![field] = 'changed'; const current = structuredClone([...rows]);
    await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' }); expect([...rows]).toEqual(current);
  });
  it('rejects source revision changes even if values were restored', async () => {
    const plan = await prepare(); versions.set('parental_controls/legacy', 1); await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each(['disabled', 'recreated', 'binding'])('rejects current target %s changes', async kind => {
    const plan = await prepare(); if (kind === 'disabled') users.get('alice').disabled = true; if (kind === 'recreated') users.get('alice').metadata.creationTime = '2026-02-01T00:00:00Z'; if (kind === 'binding') rows.get('_account_profile_bindings/alice')!.revision = 'b'.repeat(48);
    const current = structuredClone([...rows]); await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' }); expect([...rows]).toEqual(current);
  });
  it.each(['disabled', 'unprivileged'])('rejects a %s reviewer without modifying records', async kind => {
    const plan = await prepare(); if (kind === 'disabled') users.get('reviewer').disabled = true; else users.get('reviewer').customClaims.admin = false;
    const current = structuredClone([...rows]); await expect(apply(plan)).rejects.toMatchObject({ code: 'permission-denied' }); expect([...rows]).toEqual(current);
  });
  it('refuses a mismatched case or extra plan field', async () => {
    const plan = await prepare(); await expect(applyReviewedParentalRecovery(database, auth, plan, 'reviewer', 'different')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(apply({ ...plan, approved: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses duplicate controls and foreign canonical collisions before approval', async () => {
    rows.set('parental_controls/other', row()); await expect(prepare()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.delete('parental_controls/other');
    rows.set('parental_controls/alice', { ...row(), user_id: 'bob' }); await expect(prepare()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('accepts only a protected reviewed transfer chain for a previous absent owner', async () => {
    rows.get('parental_controls/legacy')!.user_id = 'old-alice'; await expect(prepare()).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set('_account_profile_bindings/old-alice', { version: 1, owner_uid: 'old-alice', profile_id: 'profile-alice', status: 'retired', transferred_to_uid: 'alice' });
    const plan = await prepare(); users.set('old-alice', { uid: 'old-alice' }); await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' });
    users.delete('old-alice'); await expect(apply(plan)).resolves.toMatchObject({ ok: true });
  });
  it('does not reapply recovery after a later settings change or corrupt archive', async () => {
    const plan = await prepare(); await apply(plan); rows.get('parental_controls/alice')!.is_active = false;
    await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' }); rows.get('parental_controls/alice')!.is_active = true;
    [...rows].find(([path]) => path.startsWith('_parental_controls_archive/'))![1].source_row = { altered: true };
    await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not let a recreated reviewer replay the previous reviewer audit', async () => {
    const plan = await prepare(); await apply(plan); users.get('reviewer').metadata.creationTime = '2026-01-01T00:00:00Z';
    await expect(apply(plan)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

it('does not conflate a canonical profile alias with a currently active Auth owner', async () => {
  users.set('profile-alice', { uid: 'profile-alice' }); const original = structuredClone([...rows]);
  await expect(prepare()).rejects.toMatchObject({ code: 'failed-precondition' }); expect([...rows]).toEqual(original);
});
