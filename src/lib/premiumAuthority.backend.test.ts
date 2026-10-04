// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
type Row = Record<string, any>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>(), writes: [] as string[], disabled: false, limited: false, afterRead: null as null | ((path: string) => void) }));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const snapshot = (path: string) => { const value = structuredClone(state.rows.get(path)); return { id: path.split('/').at(-1)!, exists: value !== undefined, data: () => value }; };
  const ref = (path: string) => ({ path, get: async () => snapshot(path) });
  const query = (name: string, filters: Array<[string, unknown]> = [], max = Infinity, order?: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    where: (key: string, op: string, value: unknown) => { if (op !== '==') throw new Error('Unexpected operator'); return query(name, [...filters, [key, value]], max, order); },
    limit: (n: number) => query(name, filters, n, order), orderBy: (key: string) => query(name, filters, max, key),
    get: async () => ({ docs: [...state.rows].filter(([path, row]) => path.startsWith(`${name}/`) && path.split('/').length === 2 && filters.every(([key, value]) => row[key] === value)).sort((a,b) => order ? String(b[1][order]).localeCompare(String(a[1][order])) : 0).slice(0, max).map(([path]) => snapshot(path)) }),
  });
  return {
    requireAuth: (r: Row) => { if (!r.auth) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' }); return r.auth.uid; },
    requireAdmin: async (r: Row) => { if (r.auth?.token?.admin !== true) throw Object.assign(new Error('Admin only'), { code: 'permission-denied' }); },
    auth: { getUser: async (uid: string) => uid === 'missing' ? Promise.reject(new Error('Not found')) : { uid, disabled: state.disabled } },
    rateLimit: async () => !state.limited, enforceRateLimit: (allowed: boolean) => { if (!allowed) throw Object.assign(new Error('Rate limit'), { code: 'resource-exhausted' }); },
    db: { collection: query, runTransaction: async (callback: (tx: any) => Promise<unknown>) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const reads = new Map<string, string | undefined>(); const writes: Array<{ path: string; data: Row; mode: string }> = [];
        const result = await callback({
          get: async (target: { path: string }) => { if (writes.length) throw new Error('Read after write'); const snap = snapshot(target.path); reads.set(target.path, JSON.stringify(snap.data())); state.afterRead?.(target.path); return snap; },
          create: (r: { path: string }, data: Row) => writes.push({ path: r.path, data, mode: 'create' }),
          set: (r: { path: string }, data: Row) => writes.push({ path: r.path, data, mode: 'set' }),
          update: (r: { path: string }, data: Row) => writes.push({ path: r.path, data, mode: 'update' }),
        });
        if ([...reads].some(([path,value]) => JSON.stringify(state.rows.get(path)) !== value)) continue;
        for (const w of writes) {
          if (w.mode === 'create' && state.rows.has(w.path)) throw new Error('Already exists');
          if (w.mode === 'update' && !state.rows.has(w.path)) throw new Error('Missing');
        }
        for (const w of writes) { state.rows.set(w.path, structuredClone(w.mode === 'update' ? { ...state.rows.get(w.path), ...w.data } : w.data)); state.writes.push(w.path); }
        return result;
      }
      throw new Error('Contention');
    } },
  };
});
import { premiumGiftManage } from '../../functions/src/premiumGifts';
import { hasOwnerRole, isActivePremiumGrant, premiumIdentity, premiumStatusForUid, premiumStatusForRequest, unexpired } from '../../functions/src/_shared/premiumAuthority';
const invoke = (uid: string | null, data: Row, admin = false) => premiumGiftManage.run({ auth: uid ? { uid, token: { admin } } : undefined, data } as Parameters<typeof premiumGiftManage.run>[0]) as Promise<any>;
const create = (data: Row = {}) => invoke('staff', { action: 'create', recipientUserId: 'alice', requestId: 'request-1', ...data }, true);
const grant = (extra: Row = {}) => ({ schema_version: 1, grant_id: 'grant-1', user_id: 'alice', gifted_by: 'staff', status: 'pending', is_active: false, created_at: '2026-01-01T00:00:00Z', accepted_at: null, revoked_at: null, expires_at: null, ...extra });
beforeEach(() => { state.rows.clear(); state.writes = []; state.afterRead = null; state.disabled = false; state.limited = false; });

describe('server-owned premium gifts', () => {
  it.each(['pending', 'accept', 'create', 'revoke', 'list'])('requires authentication for %s', async action => { await expect(invoke(null, { action })).rejects.toMatchObject({ code: 'unauthenticated' }); expect(state.writes).toEqual([]); });
  it.each(['create', 'revoke', 'list'])('requires staff authority for %s', async action => { await expect(invoke('alice', { action, recipientUserId: 'alice', grantId: 'grant-1', requestId: 'one' })).rejects.toMatchObject({ code: 'permission-denied' }); expect(state.writes).toEqual([]); });
  it('creates a pending grant bound to authenticated staff and recipient; ignores forged status fields', async () => {
    const result = await create({ is_active: true, status: 'accepted', gifted_by: 'other', user_id: 'other' });
    expect(result.gift).toMatchObject({ user_id: 'alice', gifted_by: 'staff', status: 'pending', is_active: false, accepted_at: null, expires_at: null });
    expect(state.rows.get('premium_grants/alice')).toMatchObject({ grant_id: result.gift.id });
    expect(state.writes).toHaveLength(2);
  });
  it('replays lost acknowledgments without granting a second gift', async () => { const first = await create(); const second = await create(); expect(second).toEqual(first); expect(state.writes).toHaveLength(2); });
  it('rejects a reused request for another recipient or duration', async () => { await create(); await expect(create({ recipientUserId: 'bob' })).rejects.toMatchObject({ code: 'already-exists' }); await expect(create({ durationDays: 30 })).rejects.toMatchObject({ code: 'already-exists' }); });
  it('does not revive a revoked gift when a lost create response is retried', async () => { const first = await create(); await invoke('staff', { action: 'revoke', recipientUserId: 'alice', grantId: first.gift.id }, true); expect((await create()).gift.status).toBe('revoked'); });
  it('rejects replay for a superseded grant and stale revocation of a replacement', async () => {
    const first = await create(); await invoke('staff', { action: 'revoke', recipientUserId: 'alice', grantId: first.gift.id }, true);
    const second = await create({ requestId: 'second' }); expect(second.gift.id).not.toBe(first.gift.id);
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(invoke('staff', { action: 'revoke', recipientUserId: 'alice', grantId: first.gift.id }, true)).rejects.toMatchObject({ code: 'not-found' });
  });
  it('concurrent create requests share one canonical grant', async () => { const [a,b] = await Promise.all([create(), create({ requestId: 'second' })]); expect(a.gift.id).toBe(b.gift.id); expect(state.writes.filter(p => p === 'premium_grants/alice')).toHaveLength(1); });
  it.each([0, -1, 366, 1.5, '30', null])('rejects invalid duration %j', async durationDays => { await expect(create({ durationDays })).rejects.toMatchObject({ code: 'invalid-argument' }); expect(state.writes).toEqual([]); });
  it('honors a bounded duration', async () => { const start = Date.now(); const { gift } = await create({ durationDays: 7 }); expect(Date.parse(gift.expires_at)).toBeGreaterThanOrEqual(start + 7 * 86400000); });
  it('rejects unavailable, disabled and rate-limited recipients/actions', async () => {
    await expect(create({ recipientUserId: 'missing' })).rejects.toMatchObject({ code: 'not-found' }); state.disabled = true;
    await expect(create()).rejects.toMatchObject({ code: 'not-found' }); state.disabled = false; state.limited = true;
    await expect(create()).rejects.toMatchObject({ code: 'resource-exhausted' }); expect(state.writes).toEqual([]);
  });
  it('recipient alone accepts its current pending grant and retries safely', async () => {
    state.rows.set('premium_grants/alice', grant());
    await expect(invoke('bob', { action: 'accept', grantId: 'grant-1', recipientUserId: 'alice' })).rejects.toMatchObject({ code: 'not-found' });
    const accepted = await invoke('alice', { action: 'accept', grantId: 'grant-1', gifted_by: 'bob', expires_at: 'invalid' });
    expect(accepted.gift).toMatchObject({ user_id: 'alice', gifted_by: 'staff', status: 'accepted', is_active: true, expires_at: null });
    expect(await invoke('alice', { action: 'accept', grantId: 'grant-1' })).toEqual(accepted); expect(state.writes).toHaveLength(1);
  });
  it.each([{ status: 'revoked', revoked_at: '2026-01-02T00:00:00Z' }, { expires_at: '2000-01-01T00:00:00Z' }, { is_active: true }, { accepted_at: 'forged' }])('rejects unavailable or malformed grant %j', async row => {
    state.rows.set('premium_grants/alice', grant(row)); await expect(invoke('alice', { action: 'accept', grantId: 'grant-1' })).rejects.toThrow(); expect(state.writes).toEqual([]);
  });
  it('rechecks a concurrent revocation before committing acceptance', async () => {
    state.rows.set('premium_grants/alice', grant()); state.afterRead = path => { if (path === 'premium_grants/alice') { state.afterRead = null; state.rows.set(path, grant({ status: 'revoked', revoked_at: '2026-01-02T00:00:00Z' })); } };
    await expect(invoke('alice', { action: 'accept', grantId: 'grant-1' })).rejects.toMatchObject({ code: 'failed-precondition' }); expect(state.writes).toEqual([]);
  });
  it('concurrent accept and revoke end with a revoked gift', async () => {
    state.rows.set('premium_grants/alice', grant()); await Promise.allSettled([invoke('alice', { action: 'accept', grantId: 'grant-1' }), invoke('staff', { action: 'revoke', recipientUserId: 'alice', grantId: 'grant-1' }, true)]);
    expect(state.rows.get('premium_grants/alice')).toMatchObject({ status: 'revoked', is_active: false });
  });
  it('returns only the authenticated recipient pending gift and excludes expired/revoked grants', async () => {
    state.rows.set('premium_grants/alice', grant()); state.rows.set('profiles/staff-profile', { user_id: 'staff', username: 'team' });
    expect(await invoke('alice', { action: 'pending', recipientUserId: 'bob' })).toEqual({ gift: { id: 'grant-1', user_id: 'alice', gifterUsername: 'team', expires_at: null } });
    expect(await invoke('bob', { action: 'pending', recipientUserId: 'alice' })).toEqual({ gift: null });
    state.rows.set('premium_grants/alice', grant({ expires_at: '2000-01-01T00:00:00Z' })); expect(await invoke('alice', { action: 'pending' })).toEqual({ gift: null });
  });
  it('bounds and deduplicates staff status lookups', async () => { state.rows.set('premium_grants/alice', grant()); expect((await invoke('staff', { action: 'list', userIds: ['alice', 'alice', 'bob'] }, true)).gifts).toHaveLength(1); await expect(invoke('staff', { action: 'list', userIds: Array(21).fill('alice') }, true)).rejects.toMatchObject({ code: 'invalid-argument' }); });
});

describe('premium entitlement resolution', () => {
  it('separates migrated owner cosmetic preview from callable management capability', async () => {
    state.rows.set('profiles/legacy-alice', { user_id: 'alice' }); state.rows.set('user_roles_auth/owner', { user_id: 'legacy-alice', role: 'owner' });
    const request = { auth: { uid: 'alice', token: {} }, data: {} } as Parameters<typeof premiumStatusForRequest>[0];
    expect(await premiumStatusForRequest(request)).toMatchObject({ is_owner: true, can_manage_gifts: false });
    request.auth!.token.admin = true; expect(await premiumStatusForRequest(request)).toMatchObject({ can_manage_gifts: true });
  });
  it('ignores formerly client-writable historical gifts and profile premium flags', async () => {
    state.rows.set('gifted_premium/old', { user_id: 'alice', recipient_id: 'legacy-alice', is_active: true, status: 'accepted', accepted_at: '2026-01-01T00:00:00Z' });
    state.rows.set('profiles/legacy-alice', { user_id: 'alice', is_premium: true });
    expect(await premiumStatusForUid('alice', false)).toMatchObject({ active: false, gift_active: false });
  });
  it('pending gifts do not unlock benefits; confirmed acceptance does', async () => { state.rows.set('premium_grants/alice', grant()); expect((await premiumStatusForUid('alice')).active).toBe(false); await invoke('alice', { action: 'accept', grantId: 'grant-1' }); expect(await premiumStatusForUid('alice')).toMatchObject({ active: true, gift_active: true, source: 'gift' }); });
  it.each([undefined, 'invalid', '2000-01-01', 0])('rejects invalid/expired subscription expiry %j', async expires_at => { state.rows.set('subscriptions/alice', { status: 'active', expires_at }); expect((await premiumStatusForUid('alice')).active).toBe(false); });
  it('retains explicit lifetime and future server-owned subscriptions', async () => { for (const expires_at of [null, new Date(Date.now() + 86400000).toISOString()]) { state.rows.set('subscriptions/alice', { status: 'active', expires_at }); expect((await premiumStatusForUid('alice')).active).toBe(true); } });
  it('does not accept wrong-recipient, malformed or revoked grants', () => { for (const row of [grant(), grant({ user_id: 'bob', status: 'accepted' }), grant({ status: 'accepted', is_active: true, accepted_at: 'invalid' }), grant({ status: 'revoked', revoked_at: '2026-01-01' })]) expect(isActivePremiumGrant(row, 'alice')).toBe(false); });
  it('resolves unique migrated profiles, denies ambiguous aliases', async () => { state.rows.set('profiles/profile-a', { user_id: 'alice' }); expect(await premiumIdentity('alice')).toEqual({ uid: 'alice', profileId: 'profile-a' }); expect(await premiumIdentity('profile-a')).toEqual({ uid: 'alice', profileId: 'profile-a' }); state.rows.set('profiles/duplicate', { user_id: 'alice' }); expect(await premiumIdentity('alice')).toBeNull(); });
  it.each([false, null, 'true', 1])('ignores disabled/malformed owner enabled=%j', async enabled => { state.rows.set('user_roles/owner', { user_id: 'alice', role: 'owner', enabled }); expect(await hasOwnerRole('alice', undefined)).toBe(false); });
  it('honors enabled/legacy owner aliases only and preserves explicit expiry boundaries', async () => { state.rows.set('user_roles_auth/owner', { user_id: 'profile-a', role: 'owner' }); expect(await hasOwnerRole('alice', 'profile-a')).toBe(true); expect(unexpired(1000, 1000)).toBe(false); expect(unexpired({ toMillis: () => 1001 }, 1000)).toBe(true); expect(unexpired(undefined)).toBe(false); });
});
