// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { claimTokenCredit, tokenAuthorityId, validatedTokenBoostMultiplier } from '../../functions/src/_shared/tokenCreditAuthority';
import { postSourceFingerprint } from '../../functions/src/_shared/postPublicationProof';

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
const quotaPath = `_token_credit_day_limits/${actor.authUid}`;
const receiptPath = (type: string, source: string) => `_token_credit_receipts/${tokenAuthorityId([actor.authUid, type, source])}`;
const boost = (type: 'tokens_2x' | 'xp_2x' = 'tokens_2x', extra: Row = {}) => ({
  id: tokenAuthorityId([actor.authUid, type]), schema_version: 1, user_id: actor.authUid, boost_type: type,
  source_item_id: type === 'tokens_2x' ? 'token_boost_2x' : 'xp_boost_2x',
  activated_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3_599_000).toISOString(),
  consumed: false, uses_remaining: null, ...extra,
});
const claim = (type = 'daily_login', referenceId?: string, at = now) => claimTokenCredit(database, actor, { type, referenceId }, at);
function post(key = 'post-one', extra: Row = {}, at = now) {
  rows.set(`posts/${key}`, { author_id: actor.profileId, caption: 'A real retained post', ...extra }); created.set(`posts/${key}`, at);
  publication(key, actor.authUid, actor.profileId);
  return key;
}
function publication(key: string, uid: string, profileId: string) {
  rows.set(`_post_publications/${key}`, { version: 1, status: 'published', post_id: key, owner_uid: uid, profile_id: profileId,
    revision: 'a'.repeat(48), source_fingerprint: postSourceFingerprint(rows.get(`posts/${key}`)!) });
}
function comment(key = 'comment-one', extra: Row = {}, at = now) {
  rows.set(`comments/${key}`, { user_id: actor.profileId, text: 'A retained comment', post_id: 'target', ...extra }); created.set(`comments/${key}`, at);
  return key;
}
function challenge(key = 'challenge-one', extra: Row = {}) {
  rows.set(`_challenge_reward_authority/${tokenAuthorityId([actor.authUid, key])}`, {
    version: 1, auth_uid: actor.authUid, profile_id: actor.profileId, challenge_id: key,
    is_claimed: true, legacy_claimed: false, claimed_at: new Date(now).toISOString(), requirement_count: 1, xp_amount: 25, ...extra,
  });
  return key;
}
beforeEach(() => {
  rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0;
  rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid });
  rows.set(`user_auth_index/${actor.authUid}`, { profile_id: actor.profileId });
  rows.set('profiles/other-profile', { user_id: 'other-auth' });
  rows.set('posts/target', { author_id: 'other-profile', caption: 'Another person’s post' });
  publication('target', 'other-auth', 'other-profile');
});

describe('post publication reward provenance', () => {
  it.each(['missing', 'tampered', 'deleted'])('rejects %s publication proof without crediting the wallet', async mode => {
    const source = post();
    if (mode === 'missing') rows.delete(`_post_publications/${source}`);
    if (mode === 'tampered') rows.get(`posts/${source}`)!.caption = 'Changed after publication';
    if (mode === 'deleted') rows.get(`_post_publications/${source}`)!.status = 'deleted';
    await expect(claim('post_created', source)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(walletPath)).toBe(false); expect(rows.has(receiptPath('post_created', source))).toBe(false);
  });
  it('does not credit a comment on a historically unproven post', async () => {
    rows.delete('_post_publications/target');
    await expect(claim('comment_added', comment())).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(walletPath)).toBe(false);
  });
});

describe('server verified token credits', () => {
  it.each(['missing', 'foreign', 'duplicate', 'index-conflict', 'deleted'])('rejects stale or ambiguous caller profile binding: %s', async scenario => {
    const path = `profiles/${actor.profileId}`;
    if (scenario === 'missing') rows.delete(path);
    if (scenario === 'foreign') rows.set(path, { user_id: 'another-account' });
    if (scenario === 'duplicate') rows.set('profiles/duplicate-self', { user_id: actor.authUid });
    if (scenario === 'index-conflict') rows.set(`user_auth_index/${actor.authUid}`, { profile_id: 'foreign' });
    if (scenario === 'deleted') rows.set(path, { user_id: actor.authUid, is_deleted: true });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(walletPath)).toBe(false);
  });
  it('rechecks caller mapping changed before commit', async () => {
    beforeCommit = () => rows.set(`user_auth_index/${actor.authUid}`, { profile_id: 'different' });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(walletPath)).toBe(false);
  });
  it('does not confuse profile presence status with post publication status', async () => {
    rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, status: 'online' });
    rows.set('profiles/other-profile', { user_id: 'other-auth', status: 'away' });
    expect((await claim('comment_added', comment())).credited).toBe(2);
  });
  it('initializes a new canonical wallet without importing forged legacy balances or client amounts', async () => {
    rows.set('vybe_tokens/legacy-player', { user_id: actor.profileId, balance: 1_000_000 });
    const result = await claimTokenCredit(database, actor, { type: 'daily_login', amount: 99999, description: 'fake', created_at: 'tomorrow', multiplier: 50 } as never, now);
    expect(result).toEqual({ success: true, balance: 3, credited: 3, already_credited: false });
    expect(rows.get(walletPath)).toMatchObject({ id: actor.authUid, user_id: actor.authUid, schema_version: 1, balance: 3, lifetime_earned: 3, lifetime_spent: 0 });
    expect(rows.get(`token_events/${tokenAuthorityId([actor.authUid, 'daily_login', '2026-10-03'])}`)).toMatchObject({ amount: 3, description: 'Daily login' });
  });
  it('deduplicates concurrent daily claims and ignores client-provided day references', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => claim('daily_login', `fake-day-${i}`)));
    expect(results.reduce((sum, value) => sum + value.credited, 0)).toBe(3);
    expect(results.filter(value => value.already_credited)).toHaveLength(11);
    expect(rows.get(walletPath)?.balance).toBe(3);
    expect(attempts).toBeGreaterThan(12);
  });
  it('opens the next server UTC day without reviving prior activity receipts', async () => {
    await claim(); await claim('post_created', post());
    expect((await claim('daily_login', undefined, now + 86_400_000)).credited).toBe(3);
    expect((await claim('post_created', 'post-one', now + 86_400_000)).credited).toBe(0);
    expect(rows.get(walletPath)?.balance).toBe(16);
  });
  it.each(['rewarded_ad', 'ad_reward', 'quiz_completed', 'streak_bonus', 'invite_accepted', 'like_received', '__proto__', 'unknown'])('rejects unproved event %s without any writes', async type => {
    const before = structuredClone([...rows]);
    await expect(claim(type, 'fake-proof')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect([...rows]).toEqual(before);
  });
  it.each(['post_created', 'comment_added', 'challenge_completed'])('requires an actual ID for %s', async type => {
    await expect(claim(type)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(claim(type, 'nested/path')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it.each(['legacy-player', 'auth-player'])('accepts verified source ownership alias %s', async owner => {
    expect((await claim('post_created', post('owned', { author_id: owner }))).credited).toBe(10);
    expect((await claim('comment_added', comment('owned', { user_id: owner }))).credited).toBe(2);
  });
  it.each(['legacy-player', 'auth-player'])('accepts current author-only comments bound to %s', async author_id => {
    rows.set('comments/author-only', { author_id, text: 'Retained legacy comment', post_id: 'target' });
    created.set('comments/author-only', now);
    expect((await claim('comment_added', 'author-only')).credited).toBe(2);
  });
  it('does not use author-only compatibility to overlook present conflicting identities or old creation metadata', async () => {
    rows.set('comments/conflict', { author_id: actor.authUid, user_id: 'someone-else', text: 'Conflict', post_id: 'target' });
    await expect(claim('comment_added', 'conflict')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set('comments/null-owner', { author_id: actor.authUid, user_id: null, text: 'Conflict', post_id: 'target' });
    await expect(claim('comment_added', 'null-owner')).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set('comments/old-author-only', { author_id: actor.profileId, text: 'Old', post_id: 'target', created_at: new Date(now).toISOString() });
    created.set('comments/old-author-only', now - 86_400_000);
    await expect(claim('comment_added', 'old-author-only')).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(walletPath)).toBe(false);
  });
  it.each([{ author_id: 'other-auth' }, { user_id: 'other-auth' }, { user_id: null }])('rejects conflicting post ownership %j', async extra => {
    await expect(claim('post_created', post('wrong', extra))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(rows.has(walletPath)).toBe(false);
  });
  it.each([{ user_id: 'other-auth' }, { author_id: 'other-auth' }, { author_id: null }])('rejects conflicting comment ownership %j', async extra => {
    await expect(claim('comment_added', comment('wrong', extra))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it.each([{ deleted_at: 'deleted' }, { is_deleted: true }, { status: 'draft' }, { status: 'scheduled' }, { is_draft: true }, { caption: '' }, { caption: ' ', media_url: 'javascript:alert(1)' }])('rejects unavailable or empty posts %j', async extra => {
    await expect(claim('post_created', post('unavailable', extra))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('accepts retained media posts without a caption', async () => {
    expect((await claim('post_created', post('media', { caption: '', media_url: 'gs://demo.appspot.com/media/auth-player/clip.mp4' }))).credited).toBe(10);
  });
  it.each([now - 86_400_000, now + 1, NaN])('ignores client time when server creation time is ineligible %s', async at => {
    await expect(claim('post_created', post('old', { created_at: new Date(now).toISOString() }, at))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not credit missing sources or missing targets', async () => {
    await expect(claim('post_created', 'missing')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(claim('comment_added', comment('missing-target', { post_id: 'missing' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each(['auth-player', 'legacy-player'])('rejects comments on own post alias %s', async author_id => {
    rows.set('posts/target', { author_id, caption: 'Own post' });
    await expect(claim('comment_added', comment())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it.each(['missing', 'deleted', 'conflicting', 'ambiguous'])('rejects target owner %s', async scenario => {
    if (scenario === 'missing') rows.delete('profiles/other-profile');
    if (scenario === 'deleted') rows.set('profiles/other-profile', { user_id: 'other-auth', is_deleted: true });
    if (scenario === 'conflicting') rows.set('posts/target', { author_id: 'other-profile', user_id: 'auth-player', caption: 'Target' });
    if (scenario === 'ambiguous') { rows.set('posts/target', { author_id: 'other-auth', caption: 'Target' }); rows.set('profiles/duplicate', { user_id: 'other-auth' }); }
    await expect(claim('comment_added', comment())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects a deleted or draft target', async () => {
    rows.set('posts/target', { author_id: 'other-profile', caption: 'Target', status: 'draft' });
    await expect(claim('comment_added', comment())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('caps each source category atomically, but permits replay after hitting the cap', async () => {
    for (let i = 0; i < 3; i++) await claim('post_created', post(`post-${i}`));
    await expect(claim('post_created', post('over-cap'))).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect((await claim('post_created', 'post-0')).already_credited).toBe(true);
    for (let i = 0; i < 10; i++) await claim('comment_added', comment(`comment-${i}`));
    await expect(claim('comment_added', comment('over-cap'))).rejects.toMatchObject({ code: 'resource-exhausted' });
    for (let i = 0; i < 5; i++) await claim('challenge_completed', challenge(`challenge-${i}`));
    await expect(claim('challenge_completed', challenge('over-cap'))).rejects.toMatchObject({ code: 'resource-exhausted' });
    await claim(); expect(rows.get(walletPath)?.balance).toBe(178);
  });
  it('enforces the daily cap across parallel different posts', async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => claim('post_created', post(`parallel-${i}`))));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3);
    expect(rows.get(walletPath)?.balance).toBe(30);
  });
  it('rolls back wallet, event, receipt and quota together on commit failure', async () => {
    failCommit = true; const before = structuredClone([...rows]);
    await expect(claim()).rejects.toThrow('atomic commit failure');
    expect([...rows]).toEqual(before);
  });
  it('rechecks source deletion racing the credit', async () => {
    post(); beforeCommit = () => rows.delete('posts/post-one');
    await expect(claim('post_created', 'post-one')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(rows.has(walletPath)).toBe(false);
  });
  it.each([{ schema_version: 0 }, { user_id: 'someone-else' }, { id: 'wrong' }, { balance: -1 }, { balance: 0.5 }, { lifetime_spent: 5 }, { lifetime_earned: NaN }])('fails closed on malformed canonical wallets %j', async extra => {
    rows.set(walletPath, { updated_at: new Date(now).toISOString(), schema_version: 1, user_id: actor.authUid, id: actor.authUid, balance: 10, lifetime_earned: 10, lifetime_spent: 0, ...extra });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects safe integer overflow without consuming activity', async () => {
    rows.set(walletPath, { updated_at: new Date(now).toISOString(), schema_version: 1, user_id: actor.authUid, id: actor.authUid, balance: Number.MAX_SAFE_INTEGER, lifetime_earned: Number.MAX_SAFE_INTEGER, lifetime_spent: 0 });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(receiptPath('daily_login', '2026-10-03'))).toBe(false);
  });
  it('rejects malformed quota and receipt bindings', async () => {
    rows.set(quotaPath, { schema_version: 1, user_id: 'foreign', day: '2026-10-03', counts: {} });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.delete(quotaPath); await claim();
    const path = receiptPath('daily_login', '2026-10-03'); rows.set(path, { ...rows.get(path), user_id: 'foreign' });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not revive an exhausted quota with caller-provided timestamps', async () => {
    for (let i = 0; i < 3; i++) await claim('post_created', post(`post-${i}`));
    const referenceId = post('fourth');
    await expect(claimTokenCredit(database, actor, { type: 'post_created', referenceId, nowMs: now + 86_400_000 } as never, now)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(rows.get(walletPath)?.balance).toBe(30);
  });
});

describe('challenge and boost authority', () => {
  it('ignores public challenge receipt fields and legacy claimed mirrors', async () => {
    rows.set('challenge_rewards/forged', { user_id: actor.authUid, challenge_id: 'challenge-one', is_claimed: true });
    await expect(claim('challenge_completed', 'challenge-one')).rejects.toMatchObject({ code: 'failed-precondition' });
    challenge(); expect((await claim('challenge_completed', 'challenge-one')).credited).toBe(25);
  });
  it.each([{ version: 0 }, { auth_uid: 'foreign' }, { profile_id: 'foreign' }, { challenge_id: 'foreign' }, { is_claimed: false }, { legacy_claimed: true }, { legacy_claimed: undefined }, { xp_amount: 0.5 }, { requirement_count: 0 }, { claimed_at: new Date(now + 1).toISOString() }, { claimed_at: new Date(now - 86_400_000).toISOString() }])('rejects unproved challenge authority %j', async extra => {
    await expect(claim('challenge_completed', challenge('unproved', extra))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('credits a valid protected token boost at most twice and never again on replay', async () => {
    rows.set(`token_boosts/${tokenAuthorityId([actor.authUid, 'tokens_2x'])}`, boost());
    expect((await claim()).credited).toBe(6);
    expect((await claim()).credited).toBe(0);
  });
  it('ignores forged legacy boost documents', async () => {
    rows.set('active_boosts/forged', boost()); rows.set('user_boosts/forged', boost());
    expect((await claim()).credited).toBe(3);
  });
  it.each([{ schema_version: 0 }, { id: 'wrong' }, { user_id: 'wrong' }, { boost_type: 'xp_2x' }, { source_item_id: 'unverified-item' }, { consumed: true }, { uses_remaining: 1 }, { activated_at: new Date(now + 1).toISOString() }, { expires_at: new Date(now).toISOString() }, { expires_at: new Date(now + 3_600_001).toISOString() }, { expires_at: 'invalid' }])('never grants a multiplier from malformed or expired proof %j', extra => {
    expect(validatedTokenBoostMultiplier(boost('tokens_2x', extra), actor.authUid, 'tokens_2x', now)).toBe(1);
  });
});
