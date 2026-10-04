// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../functions/src/_shared/admin', () => ({ db: {}, requireAdmin: vi.fn(), requireAuth: vi.fn() }));
import { tokenMarketplaceState, purchaseTokenItem, activateTokenBoost, equipTokenItem, resolveTokenActor, tokenTupleId } from '../../functions/src/_shared/tokenMarketplaceAuthority';
type Row = Record<string, unknown>;
const now = Date.parse('2026-10-03T12:00:00Z');
const actor = { authUid: 'auth-player', profileId: 'legacy-player' };
const rows = new Map<string, Row>();
const created = new Map<string, number>();
let beforeCommit: (() => void) | null = null;
let failCommit = false;
let attempts = 0;
const ref = (path: string) => ({ path, id: path.split('/').at(-1)!, get: async () => snap(path) });
const snap = (path: string) => {
  const data = structuredClone(rows.get(path));
  const createdAt = created.get(path) ?? now;
  return { exists: data !== undefined, id: path.split('/').at(-1)!, ref: ref(path),
    data: () => data, createTime: { toMillis: () => createdAt } };
};
function collection(name: string) {
  const clauses: Array<[string, string, unknown]> = [];
  let cap = Infinity;
  const query = {
    name, clauses,
    doc: (id: string) => ref(`${name}/${id}`),
    where: (key: string, operator: string, value: unknown) => { clauses.push([key, operator, value]); return query; },
    limit: (value: number) => { cap = value; return query; },
    orderBy: () => query,
    evaluate: () => {
      const docs = [...rows.keys()].filter(path => path.startsWith(`${name}/`) && clauses.every(([key, op, value]) => {
        const rowValue = rows.get(path)![key];
        if (op === 'in') return (value as unknown[]).includes(rowValue);
        if (op === '>=') return String(rowValue) >= String(value);
        return rowValue === value;
      })).slice(0, cap).map(snap);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    get: async () => query.evaluate(),
  };
  return query;
}
const database = {
  collection,
  runTransaction: async <T>(body: (tx: unknown) => Promise<T>): Promise<T> => {
    for (let attempt = 0; attempt < 20; attempt++) {
      attempts++;
      const reads = new Map<string, string | undefined>();
      const queryReads: Array<[ReturnType<typeof collection>, string]> = [];
      const writes: Array<() => void> = [];
      const tx = {
        get: async (target: ReturnType<typeof ref> | ReturnType<typeof collection>) => {
          if (writes.length) throw new Error('Read after write');
          const result = await target.get();
          if ('path' in target) reads.set(target.path, JSON.stringify((result as ReturnType<typeof snap>).data()));
          else queryReads.push([target, JSON.stringify((result as ReturnType<typeof target.evaluate>).docs.map(doc => [doc.id, doc.data()]))]);
          return result;
        },
        create: (target: ReturnType<typeof ref>, data: Row) => writes.push(() => {
          if (rows.has(target.path)) throw new Error('Already exists');
          rows.set(target.path, structuredClone(data));
        }),
        set: (target: ReturnType<typeof ref>, data: Row, options?: { merge: boolean }) => writes.push(() => {
          rows.set(target.path, structuredClone({ ...(options?.merge ? rows.get(target.path) : {}), ...data }));
        }),
        update: (target: ReturnType<typeof ref>, data: Row) => writes.push(() => {
          if (!rows.has(target.path)) throw new Error('Missing update target');
          rows.set(target.path, structuredClone({ ...rows.get(target.path), ...data }));
        }),
      };
      const result = await body(tx);
      const hook = beforeCommit; beforeCommit = null; hook?.();
      let conflict = [...reads].some(([path, value]) => JSON.stringify(rows.get(path)) !== value);
      for (const [query, value] of queryReads) {
        if (JSON.stringify(query.evaluate().docs.map(doc => [doc.id, doc.data()])) !== value) conflict = true;
      }
      if (conflict) continue;
      if (failCommit) throw new Error('Fixture atomic commit failure');
      // No async gap after validation: changes commit as one atomic unit.
      const backup = new Map(rows);
      try { writes.forEach(write => write()); } catch (error) {
        rows.clear(); backup.forEach((row, path) => rows.set(path, row)); throw error;
      }
      return result;
    }
    throw new Error('Transaction contention');
  },
} as unknown as Firestore;

const walletPath = `token_wallets/${actor.authUid}`;
const inventoryPath = (item: string) => `token_entitlements/${tokenTupleId(actor.authUid, item)}`;
const requestPath = (id: string) => `_token_purchase_requests/${tokenTupleId(actor.authUid, id)}`;
const boostPath = (type: string) => `token_boosts/${tokenTupleId(actor.authUid, type)}`;
function wallet(balance = 1_000, patch: Row = {}) { rows.set(walletPath, { schema_version: 1, id: actor.authUid, user_id: actor.authUid, balance, lifetime_earned: balance, lifetime_spent: 0, updated_at: new Date(now).toISOString(), ...patch }); }
function owned(item: string, quantity = 1, kind = 'consumable', patch: Row = {}) { rows.set(inventoryPath(item), { schema_version: 1, user_id: actor.authUid, item_id: item, kind, quantity, purchased_at: new Date(now).toISOString(), ...patch }); }
const buy = (requestId = 'buy', itemId = 'xp_boost_2x', expectedCost = 75) => purchaseTokenItem(database, actor, { requestId, itemId, expectedCost }, now);
const activate = (requestId = 'activate', itemId = 'xp_boost_2x', time = now) => activateTokenBoost(database, actor, { requestId, itemId }, time);
const equip = (type: string, value: string | null) => equipTokenItem(database, actor, { type, value }, now);
const state = () => tokenMarketplaceState(database, actor, now);
beforeEach(() => {
  rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0;
  rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid });
  rows.set(`user_auth_index/${actor.authUid}`, { profile_id: actor.profileId });
});

describe('marketplace identity and authority state', () => {
  it('resolves one migrated profile and rejects inconsistent indexes or duplicate owners', async () => {
    expect(await resolveTokenActor(database, actor.authUid)).toEqual(actor);
    rows.set(`user_auth_index/${actor.authUid}`, { profile_id: 'other' });
    await expect(resolveTokenActor(database, actor.authUid)).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.delete(`user_auth_index/${actor.authUid}`); rows.set('profiles/duplicate', { user_id: actor.authUid });
    await expect(resolveTokenActor(database, actor.authUid)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not import old balance, receipt, boost, or public XP markers', async () => {
    rows.set('vybe_tokens/old', { user_id: actor.profileId, balance: 1_000_000 });
    rows.set('marketplace_purchases/old', { user_id: actor.authUid, item_id: 'avatar_frame_gold' });
    rows.set('user_active_boosts/old', { user_id: actor.authUid, boost_type: 'xp_2x', consumed: false });
    rows.set('user_levels/old', { user_id: actor.authUid, current_level: 999, verified_total_xp: 99999, verified_xp_version: 1 });
    const result = await state();
    expect(result).toMatchObject({ wallet: { balance: 0 }, inventory: [], boosts: [], legacy_review: true, verified_total_xp: 0 });
    expect(result.catalog.filter(item => !item.available).map(item => item.id)).toEqual(['streak_shield', 'visibility_boost', 'roulette_pack']);
    expect(rows.has(walletPath)).toBe(false);
    await expect(buy()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each([{ schema_version: 0 }, { user_id: 'other' }, { balance: NaN }, { balance: 1.5 }, { lifetime_spent: -1 }, { balance: 999 }, { updated_at: '2026-10-03' }])('rejects a malformed protected wallet %j', async patch => {
    wallet(1000, patch); await expect(state()).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(buy()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(rows.has(requestPath('buy'))).toBe(false);
  });
  it('tuple hashing separates delimiter collisions', () => { expect(tokenTupleId('a_b', 'c')).not.toBe(tokenTupleId('a', 'b_c')); });
  it('rechecks profile ownership in the mutation transaction', async () => {
    wallet(); beforeCommit = () => rows.set(`profiles/${actor.profileId}`, { user_id: 'other' });
    await expect(buy()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(walletPath)?.balance).toBe(1000); expect(rows.has(requestPath('buy'))).toBe(false);
  });
  it.each([{ is_deleted: true }, { deleted_at: new Date(now).toISOString() }])('rejects deleted actors on resolution and a concurrent purchase %j', async patch => {
    wallet(); rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, ...patch });
    await expect(resolveTokenActor(database, actor.authUid)).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid });
    beforeCommit = () => rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, ...patch });
    await expect(buy()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(walletPath)?.balance).toBe(1000); expect(rows.has(requestPath('buy'))).toBe(false);
  });
});

describe('atomic token purchases', () => {
  it('debits and records one purchase with an immutable replay receipt', async () => {
    wallet(); expect(await buy()).toMatchObject({ success: true, balance: 925, item_id: 'xp_boost_2x' });
    expect(await buy()).toMatchObject({ balance: 925 });
    expect(rows.get(walletPath)).toMatchObject({ balance: 925, lifetime_spent: 75, lifetime_earned: 1000 });
    expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1);
    expect([...rows.keys()].filter(key => key.startsWith('token_events/'))).toHaveLength(1);
  });
  it('concurrent retries charge once', async () => {
    wallet(); await Promise.all([buy(), buy(), buy()]);
    expect(rows.get(walletPath)?.balance).toBe(925); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1);
  });
  it('two concurrent purchases cannot overspend one wallet', async () => {
    wallet(100); const results = await Promise.allSettled([buy('one'), buy('two')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(rows.get(walletPath)?.balance).toBe(25); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1);
  });
  it('separate purchases add consumable quantities and debit both', async () => {
    wallet(); await Promise.all([buy('one'), buy('two')]);
    expect(rows.get(walletPath)?.balance).toBe(850); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(2);
  });
  it('permanent items cannot be charged twice, including concurrent requests', async () => {
    wallet(); const results = await Promise.allSettled([buy('one', 'theme_neon', 200), buy('two', 'theme_neon', 200)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(rows.get(walletPath)?.balance).toBe(800); expect(rows.get(inventoryPath('theme_neon'))?.quantity).toBe(1);
  });
  it('request ID reuse with different payload or action is rejected', async () => {
    wallet(); await buy();
    await expect(buy('buy', 'token_boost_2x', 100)).rejects.toMatchObject({ code: 'already-exists' });
    await expect(activate('buy')).rejects.toMatchObject({ code: 'already-exists' });
    expect(rows.get(walletPath)?.balance).toBe(925);
  });
  it.each([0, -1, 74, 75.1, Infinity, NaN])('rejects caller price %s', async price => {
    wallet(); await expect(buy('bad', 'xp_boost_2x', price)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(walletPath)?.balance).toBe(1000);
  });
  it.each(['streak_shield', 'visibility_boost', 'roulette_pack', 'made-up'])('never sells unsupported item %s', async item => {
    wallet(); await expect(buy('bad', item, 50)).rejects.toBeInstanceOf(Error); expect(rows.get(walletPath)?.balance).toBe(1000);
  });
  it('caps inventory before debit', async () => {
    wallet(); owned('xp_boost_2x', 100);
    await expect(buy()).rejects.toMatchObject({ code: 'resource-exhausted' }); expect(rows.get(walletPath)?.balance).toBe(1000);
  });
  it('cannot overwrite a foreign or malformed canonical entitlement', async () => {
    wallet(); owned('xp_boost_2x', 1, 'consumable', { user_id: 'other' });
    await expect(buy()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(rows.get(walletPath)?.balance).toBe(1000);
  });
  it('commit failure cannot leave a debit without its grant/receipt', async () => {
    wallet(); failCommit = true; await expect(buy()).rejects.toThrow('commit failure');
    expect(rows.get(walletPath)?.balance).toBe(1000); expect(rows.has(inventoryPath('xp_boost_2x'))).toBe(false); expect(rows.has(requestPath('buy'))).toBe(false);
    failCommit = false; await buy(); expect(rows.get(walletPath)?.balance).toBe(925);
  });
});

describe('consumable boost activation', () => {
  it('consumes exactly one unit and starts a server-bounded hour', async () => {
    owned('xp_boost_2x', 2); await Promise.all([activate(), activate()]);
    expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1);
    expect(rows.get(boostPath('xp_2x'))).toMatchObject({ consumed: false, uses_remaining: null, activated_at: new Date(now).toISOString(), expires_at: new Date(now + 3600000).toISOString() });
    expect((await state()).boosts).toHaveLength(1);
  });
  it('concurrent different activation requests cannot stack or consume a second unit', async () => {
    owned('xp_boost_2x', 3); const results = await Promise.allSettled([activate('one'), activate('two')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(2);
  });
  it('allows the next purchased unit after expiry, while old replay cannot extend it', async () => {
    owned('xp_boost_2x', 2); await activate(); await activate('later', 'xp_boost_2x', now + 3600000);
    const current = rows.get(boostPath('xp_2x')); await activate();
    expect(rows.get(boostPath('xp_2x'))).toEqual(current); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(0);
  });
  it('does not activate forged historical purchases or arbitrary permanent items', async () => {
    rows.set('marketplace_purchases/old', { user_id: actor.authUid, item_id: 'xp_boost_2x' });
    await expect(activate()).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activate('wrong', 'theme_neon')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('malformed or foreign active grants fail closed', async () => {
    owned('xp_boost_2x'); rows.set(boostPath('xp_2x'), { schema_version: 1, user_id: 'other', expires_at: null });
    await expect(activate()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1);
  });
  it('failed activation does not consume inventory', async () => {
    owned('xp_boost_2x'); failCommit = true; await expect(activate()).rejects.toThrow('commit failure');
    expect(rows.get(inventoryPath('xp_boost_2x'))?.quantity).toBe(1); expect(rows.has(boostPath('xp_2x'))).toBe(false);
  });
});

describe('cosmetic equip authority', () => {
  const tier = (patch: Row = {}) => rows.set('battle_pass_tiers/tier', { level: 1, xp_required: 0, reward_type: 'effect', reward_name: 'Sparkle', reward_id: 'sparkle', is_premium: false, ...patch });
  it('leaves a visible legacy selection intact but rejects re-equipping it without proof', async () => {
    rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, equipped_frame: 'legacy-frame' });
    await expect(equip('frame', 'legacy-frame')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_frame).toBe('legacy-frame');
    await equip('frame', null);
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_frame).toBeNull();
  });
  it('validates current ownership before skipping an unchanged paid selection write', async () => {
    const original = { user_id: actor.authUid, equipped_frame: 'avatar_frame_gold', updated_at: new Date(now - 1000).toISOString() };
    rows.set(`profiles/${actor.profileId}`, original);
    await expect(equip('frame', 'avatar_frame_gold')).rejects.toMatchObject({ code: 'permission-denied' });
    owned('avatar_frame_gold', 1, 'permanent'); await equip('frame', 'avatar_frame_gold');
    expect(rows.get(`profiles/${actor.profileId}`)).toEqual(original);
  });
  it('rejects an unchanged Premium selection after its subscription expires', async () => {
    tier({ is_premium: true });
    rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, equipped_effect: 'Sparkle' });
    rows.set(`subscriptions/${actor.authUid}`, { status: 'active', expires_at: new Date(now - 1).toISOString() });
    await expect(equip('effect', 'Sparkle')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_effect).toBe('Sparkle');
  });
  it('keeps unchanged null unequip free of writes or entitlement requirements', async () => {
    const original = { user_id: actor.authUid, equipped_badge_id: null, updated_at: new Date(now - 1000).toISOString() };
    rows.set(`profiles/${actor.profileId}`, original); await equip('badge', null);
    expect(rows.get(`profiles/${actor.profileId}`)).toEqual(original);
  });
  it('requires verified paid ownership and correct cosmetic type', async () => {
    await expect(equip('frame', 'avatar_frame_gold')).rejects.toMatchObject({ code: 'permission-denied' });
    owned('avatar_frame_gold', 1, 'permanent'); await equip('frame', 'avatar_frame_gold');
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_frame).toBe('avatar_frame_gold');
    await expect(equip('title', 'avatar_frame_gold')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('permits known free level-one tiers and rejects unknown arbitrary values', async () => {
    tier(); await equip('effect', 'Sparkle');
    await expect(equip('effect', 'arbitrary-css')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('uses private verified XP only for higher tiers, retaining old display XP', async () => {
    tier({ level: 2, xp_required: 100 }); rows.set('user_levels/legacy', { current_level: 999, total_xp: 99999, verified_total_xp: 99999, verified_xp_version: 1 });
    await expect(equip('effect', 'Sparkle')).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set(`_verified_xp_authority/${actor.authUid}`, { schema_version: 1, user_id: actor.authUid, profile_id: actor.profileId, verified_total_xp: 100 });
    await equip('effect', 'Sparkle'); expect(rows.get('user_levels/legacy')?.total_xp).toBe(99999);
  });
  it('rejects old premium flags and accepts a current protected gift', async () => {
    tier({ is_premium: true }); rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, is_premium: true });
    await expect(equip('effect', 'Sparkle')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set(`premium_grants/${actor.authUid}`, { schema_version: 1, grant_id: 'gift', user_id: actor.authUid, gifted_by: 'staff', status: 'accepted', is_active: true, created_at: new Date(now).toISOString(), accepted_at: new Date(now).toISOString(), revoked_at: null, expires_at: null });
    await equip('effect', 'Sparkle');
  });
  it('revocation during premium equip prevents a stale grant from authorizing the write', async () => {
    tier({ is_premium: true }); rows.set(`subscriptions/${actor.authUid}`, { status: 'active', expires_at: new Date(now + 1000).toISOString() });
    beforeCommit = () => rows.set(`subscriptions/${actor.authUid}`, { status: 'cancelled', expires_at: new Date(now + 1000).toISOString() });
    await expect(equip('effect', 'Sparkle')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_effect).toBeUndefined();
  });
  it('staff colors require actual active role documents, not profile names or badges', async () => {
    tier({ reward_type: 'name_color', reward_name: 'Gold', level: 99, xp_required: 99999 });
    rows.set('user_badges/fake', { user_id: actor.authUid, badge_name: 'owner' });
    await expect(equip('name_color', 'Gold')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set('user_roles/owner', { user_id: actor.authUid, role: 'owner', enabled: false });
    await expect(equip('name_color', 'Gold')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set('user_roles/owner', { user_id: actor.authUid, role: 'owner', enabled: true }); await equip('name_color', 'Gold');
  });
  it.each([['Gold', 'owner'], ['Shield Silver', 'moderator']])('preserves the %s staff restriction when selected by reward ID', async (name, role) => {
    tier({ reward_type: 'name_color', reward_name: name, reward_id: 'alternate-color-id', level: 1, xp_required: 0 });
    await expect(equip('name_color', 'alternate-color-id')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set('user_roles/staff', { user_id: actor.authUid, role, enabled: true });
    await equip('name_color', 'alternate-color-id');
    expect(rows.get(`profiles/${actor.profileId}`)?.equipped_name_color).toBe('alternate-color-id');
  });
  it('requires badge proof and honors a negative staff proof over a prior challenge', async () => {
    rows.set('badges/earned', { name: 'Earned' }); rows.set('user_badges/row', { user_id: actor.authUid, badge_id: 'earned', expires_at: null, grant_source: 'staff' });
    await expect(equip('badge', 'earned')).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set('_challenge_reward_authority/proof', { version: 1, auth_uid: actor.authUid, profile_id: actor.profileId, badge_id: 'earned', is_claimed: true, legacy_claimed: false });
    rows.set(`_badge_grant_authority/${tokenTupleId(actor.authUid, 'earned')}`, { schema_version: 1, user_id: actor.authUid, profile_id: actor.profileId, badge_id: 'earned', active: false });
    await expect(equip('badge', 'earned')).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.delete(`_badge_grant_authority/${tokenTupleId(actor.authUid, 'earned')}`); await equip('badge', 'earned');
  });
  it('accepts a bound live staff proof and rejects expired badges', async () => {
    rows.set('badges/earned', { name: 'Earned' }); rows.set('user_badges/row', { user_id: actor.authUid, badge_id: 'earned', expires_at: null });
    rows.set(`_badge_grant_authority/${tokenTupleId(actor.authUid, 'earned')}`, { schema_version: 1, source: 'staff', user_id: actor.authUid, profile_id: actor.profileId, badge_id: 'earned', active: true, issued_at: new Date(now).toISOString(), revoked_at: null, grant_id: 'row', expires_at: null });
    await equip('badge', 'earned'); await equip('badge', null);
    rows.set('user_badges/row', { user_id: actor.authUid, badge_id: 'earned', expires_at: new Date(now - 1).toISOString() });
    await expect(equip('badge', 'earned')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
