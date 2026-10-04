// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeFriendAuthorityId, PROFILE_VISIBILITY_DEFAULTS, normalizedProfileSettings, resolveProfileAudience } from '../../functions/src/_shared/profileAudienceAuthority';
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
        if (op === '>') return String(rowValue) > String(value);
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

const target = { uid: 'auth-target', profileId: 'legacy-target' };
const request = (patch: Row = {}) => ({ expectedOwnerUid: actor.authUid, expectedProfileId: actor.profileId, target_id: target.profileId, ...patch });
const resolve = (patch: Row = {}) => resolveProfileAudience(database, actor.authUid, request(patch));
const proofPath = () => `_close_friend_authority/${closeFriendAuthorityId(target.uid, actor.authUid)}`;
const grant = (patch: Row = {}) => rows.set(proofPath(), { version: 1, owner_uid: target.uid, owner_profile_id: target.profileId,
  friend_uid: actor.authUid, friend_profile_id: actor.profileId, enabled: true, ...patch });
const friend = (patch: Row = {}) => rows.set('friend_requests/accepted', { sender_id: actor.profileId, receiver_id: target.profileId, status: 'accepted', ...patch });
const settings = (fields: Row, patch: Row = {}) => rows.set(`profile_visibility/${target.profileId}`, { id: target.profileId, user_id: target.profileId, fields, ...patch });
beforeEach(() => {
  rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0;
  for (const identity of [{ uid: actor.authUid, profileId: actor.profileId }, target]) {
    rows.set(`profiles/${identity.profileId}`, { user_id: identity.uid }); rows.set(`user_auth_index/${identity.uid}`, { profile_id: identity.profileId });
  }
});

describe('transactional friend-profile section audience', () => {
  it('preserves explicit defaults for strangers without adding new field aliases', async () => {
    const result = await resolve();
    expect(result).toMatchObject({ ok: true, ownerUid: actor.authUid, viewerProfileId: actor.profileId, targetProfileId: target.profileId, settings: PROFILE_VISIBILITY_DEFAULTS, isSelf: false, isFriend: false, isBlocked: false });
    expect(result.fields.posts).toBe(true); expect(result.fields.followers).toBe(true); expect(result.fields.bio).toBe(false);
    expect(Object.keys(result.fields)).toEqual(Object.keys(PROFILE_VISIBILITY_DEFAULTS)); expect(result.fields).not.toHaveProperty('score');
  });
  it.each(['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private'])('preserves owner access under recognized level %s', async level => {
    settings(Object.fromEntries(Object.keys(PROFILE_VISIBILITY_DEFAULTS).map(field => [field, level])));
    const result = await resolveProfileAudience(database, target.uid, { expectedOwnerUid: target.uid, expectedProfileId: target.profileId, target_id: target.profileId });
    expect(result.isSelf).toBe(true); expect(Object.values(result.fields).every(Boolean)).toBe(true);
  });
  it('distinguishes public, accepted friends, fresh close friends and owner-only sections', async () => {
    settings({ bio: 'public', posts: 'friends', clips: 'close_friends', stories: 'only_me' });
    expect((await resolve()).fields).toMatchObject({ bio: true, posts: false, clips: false, stories: false });
    friend(); expect((await resolve()).fields).toMatchObject({ bio: true, posts: true, clips: false, stories: false });
    rows.set('close_friends/forged', { user_id: target.profileId, friend_id: actor.profileId });
    expect((await resolve()).fields.clips).toBe(false);
    grant(); expect((await resolve()).fields).toMatchObject({ posts: true, clips: true, stories: false });
  });
  it.each([{ enabled: false }, { enabled: 'true' }, { version: 2 }, { owner_uid: actor.authUid }, { owner_profile_id: 'old' }, { friend_uid: 'foreign' }, { friend_profile_id: 'old-viewer' }])('does not use a malformed or stale proof: %o', async patch => {
    settings({ bio: 'close_friends' }); friend(); grant(patch); expect((await resolve()).fields.bio).toBe(false);
  });
  it('never treats a reverse-direction grant or client forged field as authority', async () => {
    settings({ bio: 'close_friends', arbitrary_admin: 'public' }); friend();
    rows.set(`_close_friend_authority/${closeFriendAuthorityId(actor.authUid, target.uid)}`, { version: 1, owner_uid: actor.authUid, owner_profile_id: actor.profileId, friend_uid: target.uid, friend_profile_id: target.profileId, enabled: true });
    expect((await resolve()).fields.bio).toBe(false); expect((await resolve()).fields).not.toHaveProperty('arbitrary_admin');
  });
  it.each([false, true])('honors both-direction alias blocks over all public and private fields, reversed=%s', async reversed => {
    friend(); grant(); settings({ bio: 'close_friends' });
    rows.set('blocked_users/block', { blocker_id: reversed ? target.uid : actor.profileId, blocked_id: reversed ? actor.authUid : target.profileId });
    const result = await resolve(); expect(result).toMatchObject({ isBlocked: true, isFriend: false }); expect(Object.values(result.fields).some(Boolean)).toBe(false);
  });
  it('checks actual friendship tuples, including aliases, rather than only a deterministic document name', async () => {
    rows.set(`friend_requests/${actor.profileId}_${target.profileId}`, { sender_id: 'foreign-a', receiver_id: 'foreign-b', status: 'accepted' });
    expect((await resolve()).isFriend).toBe(false);
    friend({ sender_id: target.uid, receiver_id: actor.authUid }); expect((await resolve()).isFriend).toBe(true);
  });
  it.each([null, 'friends', ['public'], 1])('denies malformed settings maps: %o', async fields => {
    rows.set(`profile_visibility/${target.profileId}`, { fields }); const result = await resolve();
    expect(Object.values(result.settings).every(level => level === 'unavailable')).toBe(true); expect(Object.values(result.fields).some(Boolean)).toBe(false);
  });
  it('denies invalid levels and contradictory owner metadata, without echoing arbitrary values', async () => {
    friend(); settings({ bio: 'not-a-level', posts: true });
    expect((await resolve()).settings).toMatchObject({ bio: 'unavailable', posts: 'unavailable' }); expect((await resolve()).fields.bio).toBe(false);
    settings({}, { user_id: 'foreign' }); expect(Object.values((await resolve()).fields).some(Boolean)).toBe(false);
  });
  it.each([{ expectedOwnerUid: 'foreign' }, { expectedProfileId: 'foreign' }, { target_id: target.uid }, { target_id: 'missing' }])('rejects wrong account or noncanonical target: %o', async patch => {
    await expect(resolve(patch)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each([{ target_id: '../bad' }, { expectedProfileId: null }, { target_id: {} }, { target_id: 'x'.repeat(129) }, { admin: true }])('rejects malformed input before database work: %o', async patch => {
    await expect(resolve(patch)).rejects.toMatchObject({ code: 'invalid-argument' }); expect(attempts).toBe(0);
  });
  it('rejects duplicate, deleted, rebound-index and colliding viewer/target identities', async () => {
    rows.set('profiles/duplicate', { user_id: actor.authUid }); await expect(resolve()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.delete('profiles/duplicate');
    rows.set('profiles/collision', { user_id: target.profileId }); await expect(resolve()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.delete('profiles/collision');
    rows.set(`user_auth_index/${target.uid}`, { profile_id: 'other' }); await expect(resolve()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.set(`user_auth_index/${target.uid}`, { profile_id: target.profileId });
    rows.set(`profiles/${target.profileId}`, { user_id: target.uid, is_deleted: true }); await expect(resolve()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each(['proof', 'friendship', 'settings', 'identity'])('rechecks %s changed during a transaction before returning authority', async change => {
    settings({ bio: 'close_friends' }); friend(); grant();
    beforeCommit = () => {
      if (change === 'proof') grant({ enabled: false });
      if (change === 'friendship') rows.delete('friend_requests/accepted');
      if (change === 'settings') settings({ bio: 'only_me' });
      if (change === 'identity') rows.set(`user_auth_index/${actor.authUid}`, { profile_id: 'changed' });
    };
    if (change === 'identity') await expect(resolve()).rejects.toMatchObject({ code: 'failed-precondition' });
    else expect((await resolve()).fields.bio).toBe(false);
    expect(attempts).toBeGreaterThan(1);
  });
  it('does not convert a database failure into fallback permission', async () => {
    failCommit = true; await expect(resolve()).rejects.toThrow('atomic commit failure');
  });
});

describe('bounded settings projection', () => {
  it('retains defaults for absent map keys but never copies unknown keys or values', () => {
    expect(normalizedProfileSettings(undefined, target.profileId)).toEqual(PROFILE_VISIBILITY_DEFAULTS);
    const projected = normalizedProfileSettings({ fields: { bio: 'x'.repeat(5000), extra: 'public' } }, target.profileId);
    expect(projected.bio).toBe('unavailable'); expect(projected).not.toHaveProperty('extra');
  });
});
