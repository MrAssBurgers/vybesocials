// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireAdmin: vi.fn(), rateLimit: vi.fn(), collection: vi.fn() }));
vi.mock('../../functions/src/_shared/admin', () => ({
  db: { collection: auth.collection }, requireAdmin: auth.requireAdmin, rateLimit: auth.rateLimit,
  enforceRateLimit: (allowed: boolean) => { if (!allowed) throw Object.assign(new Error('Rate limited'), { code: 'resource-exhausted' }); },
}));
import { awardBadge, revokeBadge, changeBadgeGrant, badgeAuthorityId } from '../../functions/src/badgeAuthority';

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();
const ref = (path: string) => ({ path, id: path.split('/').at(-1)! });
const snap = (path: string) => ({ exists: rows.has(path), id: ref(path).id, ref: ref(path), data: () => structuredClone(rows.get(path)) });
function collection(name: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let limit = Infinity;
  const query = {
    doc: (id: string) => ref(`${name}/${id}`),
    where: (key: string, op: string, value: unknown) => { filters.push(row => op === 'in' ? (value as unknown[]).includes(row[key]) : row[key] === value); return query; },
    limit: (cap: number) => { limit = cap; return query; },
    read: () => {
      const docs = [...rows.keys()].filter(key => key.startsWith(`${name}/`) && filters.every(test => test(rows.get(key)!))).slice(0, limit).map(snap);
      return { docs, size: docs.length, empty: !docs.length };
    },
  };
  return query;
}
const database = {
  collection,
  runTransaction: async (body: (tx: unknown) => Promise<unknown>) => {
    const writes: Array<() => void> = [];
    const tx = {
      get: async (target: ReturnType<typeof ref> | ReturnType<typeof collection>) => {
        if (writes.length) throw new Error('Read after write');
        return 'path' in target ? snap(target.path) : target.read();
      },
      create: (target: ReturnType<typeof ref>, row: Row) => writes.push(() => { if (rows.has(target.path)) throw new Error('Already exists'); rows.set(target.path, row); }),
      set: (target: ReturnType<typeof ref>, row: Row) => writes.push(() => rows.set(target.path, row)),
      update: (target: ReturnType<typeof ref>, row: Row) => writes.push(() => rows.set(target.path, { ...rows.get(target.path), ...row })),
      delete: (target: ReturnType<typeof ref>) => writes.push(() => rows.delete(target.path)),
    };
    const result = await body(tx); writes.forEach(write => write()); return result;
  },
} as unknown as Firestore;
const now = Date.parse('2026-10-03T12:00:00Z');
const input = { p_user_id: 'legacy-target', p_badge_id: 'special' };
const grantPath = 'user_badges/target-auth_special';
const proofPath = `_badge_grant_authority/${badgeAuthorityId('target-auth', 'special')}`;
const change = (operation: 'award' | 'revoke', data: Row = input) => changeBadgeGrant(database, 'staff', data, operation, now);

beforeEach(() => {
  rows.clear(); vi.clearAllMocks();
  rows.set('profiles/legacy-target', { user_id: 'target-auth' });
  rows.set('user_auth_index/target-auth', { profile_id: 'legacy-target' });
  rows.set('badges/special', { name: 'Owner', category: 'role' });
  auth.requireAdmin.mockResolvedValue('staff'); auth.rateLimit.mockResolvedValue(true);
});

describe('staff badge authority', () => {
  it.each([awardBadge, revokeBadge])('rejects non-admin callers before reading targets', async callable => {
    auth.requireAdmin.mockRejectedValue(Object.assign(new Error('Admin only'), { code: 'permission-denied' }));
    await expect(callable.run({ data: input } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(auth.collection).not.toHaveBeenCalled(); expect(auth.rateLimit).not.toHaveBeenCalled();
  });
  it.each([awardBadge, revokeBadge])('enforces a shared staff mutation limit', async callable => {
    auth.rateLimit.mockResolvedValue(false);
    await expect(callable.run({ data: input } as never)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(auth.collection).not.toHaveBeenCalled();
  });
  it('resolves migrated profile and UID inputs to the same immutable grant', async () => {
    await expect(change('award')).resolves.toMatchObject({ already_awarded: false });
    await expect(change('award', { ...input, p_user_id: 'target-auth' })).resolves.toMatchObject({ already_awarded: true });
    expect(rows.get(grantPath)).toMatchObject({ user_id: 'target-auth', badge_id: 'special', awarded_by: 'staff' });
    expect([...rows.keys()].filter(key => key.startsWith('user_badges/'))).toHaveLength(1);
  });
  it('ignores caller badge names, role fields, owner and timestamps; grants no staff authority', async () => {
    await change('award', { ...input, user_id: 'attacker', badge_name: 'owner', role: 'owner', earned_at: 'forged' });
    expect(rows.get(grantPath)).not.toHaveProperty('role');
    expect(rows.get(grantPath)).not.toHaveProperty('badge_name');
    expect(rows.get(grantPath)?.earned_at).toBe(new Date(now).toISOString());
    expect([...rows.keys()].some(key => key.startsWith('user_roles'))).toBe(false);
    expect(rows.get(proofPath)).toMatchObject({ schema_version: 1, user_id: 'target-auth', profile_id: 'legacy-target', badge_id: 'special', source: 'staff', issued_by: 'staff', active: true, grant_id: 'target-auth_special' });
  });
  it('preserves legacy award and display preferences on retry', async () => {
    const old = { user_id: 'legacy-target', badge_id: 'special', is_primary: true, earned_at: 'old', expires_at: '2030-01-01T00:00:00Z' };
    rows.set('user_badges/random', old);
    await expect(change('award')).resolves.toMatchObject({ id: 'random', already_awarded: true });
    expect(rows.get('user_badges/random')).toEqual(old); expect(rows.has(grantPath)).toBe(false);
    expect(rows.get(proofPath)).toMatchObject({ active: true, grant_id: 'random', expires_at: old.expires_at });
  });
  it('removes all matching aliases idempotently without deleting another account’s badge', async () => {
    rows.set(grantPath, { user_id: 'target-auth', badge_id: 'special' });
    rows.set('user_badges/legacy', { user_id: 'legacy-target', badge_id: 'special' });
    rows.set('user_badges/other', { user_id: 'other', badge_id: 'special' });
    await expect(change('revoke')).resolves.toEqual({ success: true, removed: 2 });
    await expect(change('revoke')).resolves.toEqual({ success: true, removed: 0 });
    expect(rows.has('user_badges/other')).toBe(true);
    expect(rows.get(proofPath)).toMatchObject({ active: false, badge_id: 'special' });
  });
  it('clears a revoked equipped badge and retains a negative authority receipt', async () => {
    rows.set('profiles/legacy-target', { user_id: 'target-auth', equipped_badge_id: 'special' });
    await change('award');
    await change('revoke');
    expect(rows.get('profiles/legacy-target')?.equipped_badge_id).toBeNull();
    expect(rows.get(proofPath)).toMatchObject({ active: false, revoked_at: new Date(now).toISOString() });
  });
  it('does not certify an expired legacy grant or a mismatched protected proof', async () => {
    rows.set(grantPath, { user_id: 'target-auth', badge_id: 'special', expires_at: '2020-01-01' });
    await expect(change('award')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(proofPath)).toBe(false);
    rows.delete(grantPath);
    rows.set(proofPath, { schema_version: 1, user_id: 'someone-else', profile_id: 'legacy-target', badge_id: 'special' });
    await expect(change('award')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(grantPath)).toBe(false);
  });
  it('can revoke an old grant whose definition was removed', async () => {
    rows.delete('badges/special'); rows.set(grantPath, { user_id: 'target-auth', badge_id: 'special' });
    await expect(change('revoke')).resolves.toMatchObject({ removed: 1 });
  });
  it.each(['profiles/legacy-target', 'badges/special'])('refuses an award without %s', async path => {
    rows.delete(path);
    await expect(change('award')).rejects.toMatchObject({ code: 'not-found' });
    expect(rows.has(grantPath)).toBe(false);
  });
  it.each(['past', 'nonsense', '2020-01-01T00:00:00Z', 1])('rejects invalid expiry %s', async expiry => {
    await expect(change('award', { ...input, p_expires_at: expiry })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('stores a validated optional future expiry', async () => {
    await change('award', { ...input, p_expires_at: '2030-01-01T00:00:00Z' });
    expect(rows.get(grantPath)?.expires_at).toBe('2030-01-01T00:00:00.000Z');
  });
  it('rejects ambiguous profile mappings and mismatched identity index', async () => {
    rows.set('profiles/duplicate', { user_id: 'target-auth' });
    await expect(change('award')).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.delete('profiles/duplicate'); rows.set('user_auth_index/target-auth', { profile_id: 'someone-else' });
    await expect(change('award')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('never overwrites or removes a squatted grant with a different owner', async () => {
    rows.set(grantPath, { user_id: 'other', badge_id: 'special' });
    for (const operation of ['award', 'revoke'] as const) await expect(change(operation)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(grantPath)?.user_id).toBe('other');
  });
  it('fails closed when legacy duplicate grants need reconciliation', async () => {
    rows.set(grantPath, { user_id: 'target-auth', badge_id: 'special' });
    rows.set('user_badges/legacy', { user_id: 'legacy-target', badge_id: 'special' });
    await expect(change('award')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
