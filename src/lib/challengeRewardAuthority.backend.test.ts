// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { consumeChallengeReward, reconcileChallenge, rewardAuthorityId } from '../../functions/src/_shared/challengeRewardAuthority';
import { tokenAuthorityId } from '../../functions/src/_shared/tokenCreditAuthority';
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

const challenge = (overrides: Row = {}) => ({ type: 'daily', is_active: true, active_date: '2026-10-03',
  requirement_type: 'post', requirement_count: 1, reward_xp: 25, reward_badge_id: 'earned-badge', ...overrides });
const reward = (overrides: Row = {}) => ({ user_id: actor.authUid, challenge_id: 'daily-post', xp_amount: 999_999,
  badge_id: 'forged-owner-badge', is_claimed: false, ...overrides });
const proofPath = `_challenge_reward_authority/${rewardAuthorityId(actor.authUid, 'daily-post')}`;
const publicPath = 'challenge_rewards/auth-player_daily-post';
const levelPath = 'user_levels/legacy-player';
function activity(path = 'posts/post-one', overrides: Row = {}, createdAt = now) {
  rows.set(path, { author_id: actor.profileId, type: 'post', created_at: new Date(now).toISOString(), ...overrides });
  created.set(path, createdAt);
  if (path.startsWith('posts/')) publication(path.slice(6), actor.authUid, actor.profileId);
}
function publication(key: string, uid: string, profileId: string) {
  rows.set(`_post_publications/${key}`, { version: 1, status: 'published', post_id: key, owner_uid: uid, profile_id: profileId,
    revision: 'a'.repeat(48), source_fingerprint: postSourceFingerprint(rows.get(`posts/${key}`)!) });
}
const sync = () => reconcileChallenge(database, actor, 'daily-post', now);
const claim = (id = 'auth-player_daily-post') => consumeChallengeReward(database, actor, id, now);

beforeEach(() => {
  rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0;
  rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid });
  rows.set(`user_auth_index/${actor.authUid}`, { profile_id: actor.profileId });
  rows.set('challenges/daily-post', challenge());
  rows.set('battle_pass_tiers/one', { level: 1, xp_required: 0 });
  rows.set('battle_pass_tiers/two', { level: 2, xp_required: 100 });
  rows.set('profiles/other-profile', { user_id: 'other-auth' });
  rows.set('posts/same-target', { author_id: 'other-profile' });
  publication('same-target', 'other-auth', 'other-profile');
});

describe('post publication challenge provenance', () => {
  it.each(['missing', 'tampered', 'deleted'])('does not complete a post challenge from %s proof', async mode => {
    activity();
    if (mode === 'missing') rows.delete('_post_publications/post-one');
    if (mode === 'tampered') rows.get('posts/post-one')!.caption = 'Forged after publication';
    if (mode === 'deleted') rows.get('_post_publications/post-one')!.status = 'deleted';
    expect((await sync()).is_completed).toBe(false); expect(rows.has(proofPath)).toBe(false);
  });
});

describe('protected challenge XP boosts and verified XP balance', () => {
  const verifiedPath = `_verified_xp_authority/${actor.authUid}`;
  const boostPath = `token_boosts/${tokenAuthorityId([actor.authUid, 'xp_2x'])}`;
  const activeBoost = (extra: Row = {}) => ({ id: tokenAuthorityId([actor.authUid, 'xp_2x']), schema_version: 1,
    user_id: actor.authUid, boost_type: 'xp_2x', source_item_id: 'xp_boost_2x', consumed: false, uses_remaining: null,
    activated_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3_599_000).toISOString(), ...extra });
  it('denies issuance through a stale profile mapping before writing reward proof', async () => {
    activity(); rows.set(`user_auth_index/${actor.authUid}`, { profile_id: 'foreign' });
    await expect(sync()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(proofPath)).toBe(false);
  });
  it('rechecks caller mapping at consumption without granting verified XP', async () => {
    activity(); await sync(); rows.set(`profiles/${actor.profileId}`, { user_id: 'someone-else' });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(verifiedPath)).toBe(false);
    expect(rows.get(proofPath)?.is_claimed).toBe(false);
  });
  it('applies the current protected boost once at claim and records actual awarded XP', async () => {
    activity(); await sync(); rows.set(boostPath, activeBoost());
    const results = await Promise.all([claim(), claim()]);
    expect(results.reduce((sum, result) => sum + result.xp_gained, 0)).toBe(50);
    expect(results[0].challenge_id).toBe('daily-post');
    expect(rows.get(levelPath)?.total_xp).toBe(50);
    expect(rows.get(verifiedPath)).toMatchObject({ schema_version: 1, user_id: actor.authUid, profile_id: actor.profileId, verified_total_xp: 50 });
    expect(rows.get(proofPath)).toMatchObject({ xp_amount: 25, awarded_xp: 50, xp_multiplier: 2, is_claimed: true });
  });
  it('preserves boosted receipt amount when replaying a migrated reward alias', async () => {
    activity(); await sync(); rows.set(boostPath, activeBoost()); await claim();
    rows.set('challenge_rewards/alias', reward({ user_id: actor.profileId }));
    expect((await claim('alias')).xp_gained).toBe(0);
    expect(rows.get('challenge_rewards/alias')?.xp_amount).toBe(50);
    expect(rows.get(verifiedPath)?.verified_total_xp).toBe(50);
  });
  it('ignores forged legacy multipliers and historical projected XP', async () => {
    activity(); await sync(); rows.set('active_boosts/legacy', activeBoost());
    rows.set(levelPath, { user_id: actor.profileId, total_xp: 1000, current_level: 10, verified_xp_version: 1, verified_total_xp: 100_000 });
    expect((await claim()).xp_gained).toBe(25);
    expect(rows.get(levelPath)).toMatchObject({ total_xp: 1025, current_level: 10, verified_total_xp: 25 });
    expect(rows.get(verifiedPath)?.verified_total_xp).toBe(25);
  });
  it.each([{ consumed: true }, { expires_at: new Date(now).toISOString() }, { activated_at: new Date(now + 1).toISOString() }, { user_id: 'wrong' }, { boost_type: 'tokens_2x' }, { expires_at: new Date(now + 7_200_000).toISOString() }])('leaves base XP unchanged for invalid or expired boost %j', async extra => {
    activity(); await sync(); rows.set(boostPath, activeBoost(extra));
    expect((await claim()).xp_gained).toBe(25);
  });
  it('does not retroactively certify or multiply already consumed protected rewards', async () => {
    activity(); await sync(); await claim(); rows.delete(verifiedPath);
    rows.set(boostPath, activeBoost());
    expect((await claim()).xp_gained).toBe(0);
    expect(rows.get(levelPath)?.total_xp).toBe(25);
    expect(rows.has(verifiedPath)).toBe(false);
  });
  it.each([{ user_id: 'foreign' }, { profile_id: 'foreign' }, { schema_version: 0 }, { verified_total_xp: -1 }, { verified_total_xp: Number.MAX_SAFE_INTEGER }])('rejects malformed or overflowing private XP authority %j', async extra => {
    activity(); await sync();
    rows.set(verifiedPath, { schema_version: 1, user_id: actor.authUid, profile_id: actor.profileId, verified_total_xp: 10, ...extra });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(proofPath)?.is_claimed).toBe(false);
    expect(rows.has(levelPath)).toBe(false);
  });
  it('commits level, verified XP, and boosted reward receipt atomically', async () => {
    activity(); await sync(); rows.set(boostPath, activeBoost()); failCommit = true;
    await expect(claim()).rejects.toThrow('atomic commit failure');
    expect(rows.has(verifiedPath)).toBe(false); expect(rows.has(levelPath)).toBe(false);
    expect(rows.get(proofPath)?.is_claimed).toBe(false);
  });
});

describe('staff badge revocation across challenge claims', () => {
  const badgePath = 'user_badges/auth-player_earned-badge';
  const staffProofPath = `_badge_grant_authority/${tokenAuthorityId([actor.authUid, 'earned-badge'])}`;
  const revoked = (extra: Row = {}) => ({ schema_version: 1, source: 'staff', user_id: actor.authUid, profile_id: actor.profileId,
    badge_id: 'earned-badge', issued_by: 'staff', issued_at: new Date(now - 1000).toISOString(), active: false,
    revoked_at: new Date(now - 1000).toISOString(), expires_at: null, ...extra });
  it('credits verified XP without recreating a badge revoked before claim', async () => {
    activity(); await sync(); rows.set(staffProofPath, revoked());
    expect(await claim()).toMatchObject({ xp_gained: 25, awarded_badge_id: null, badge_suppressed: true });
    expect(rows.has(badgePath)).toBe(false);
    expect(rows.get(publicPath)).toMatchObject({ is_claimed: true, badge_id: null });
    expect(rows.get(proofPath)).toMatchObject({ badge_id: 'earned-badge', awarded_badge_id: null, is_claimed: true });
    expect(rows.get(levelPath)?.total_xp).toBe(25);
  });
  it('keeps a suppressed badge absent when a migrated receipt is replayed', async () => {
    activity(); await sync(); rows.set(staffProofPath, revoked()); await claim();
    rows.set('challenge_rewards/alias', reward({ user_id: actor.profileId }));
    expect((await claim('alias')).xp_gained).toBe(0);
    expect(rows.get('challenge_rewards/alias')?.badge_id).toBeNull();
    expect(rows.has(badgePath)).toBe(false);
  });
  it('rechecks a staff revocation racing reward commit', async () => {
    activity(); await sync();
    // Reconciliation is read-only for the already issued proof. Install the
    // conflict immediately before the following consumption transaction commits.
    beforeCommit = () => { beforeCommit = () => rows.set(staffProofPath, revoked()); };
    expect(await claim()).toMatchObject({ xp_gained: 25, badge_suppressed: true });
    expect(rows.has(badgePath)).toBe(false);
  });
  it.each([{ user_id: 'foreign' }, { profile_id: 'foreign' }, { badge_id: 'other' }, { schema_version: 0 }, { source: 'client' }, { active: 'false' }, { revoked_at: null }])('fails closed on malformed protected badge proof %j', async extra => {
    activity(); await sync(); rows.set(staffProofPath, revoked(extra));
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(proofPath)?.is_claimed).toBe(false); expect(rows.has(levelPath)).toBe(false);
  });
  it('does not revive an expired staff grant through another challenge', async () => {
    activity(); await sync(); rows.set(staffProofPath, revoked({ active: true, revoked_at: null, grant_id: 'old', expires_at: new Date(now).toISOString() }));
    expect(await claim()).toMatchObject({ xp_gained: 25, badge_suppressed: true });
    expect(rows.has(badgePath)).toBe(false);
  });
});

describe('trusted challenge issuance', () => {
  it('does not launder forged prior progress or counters into proof', async () => {
    rows.set('challenge_progress/legacy-player_daily-post', { user_id: actor.profileId, challenge_id: 'daily-post', current_count: 1_000_000, is_completed: true });
    rows.set(publicPath, reward());
    const progress = await sync();
    expect(progress.is_completed).toBe(false);
    expect(progress.current_count).toBe(0);
    expect(rows.has(proofPath)).toBe(false);
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(levelPath)).toBe(false);
  });
  it('uses trusted challenge amounts and badge IDs instead of the editable legacy receipt', async () => {
    rows.set(publicPath, reward()); activity();
    await expect(claim()).resolves.toMatchObject({ xp_gained: 25, already_claimed: false });
    expect(rows.get(levelPath)?.total_xp).toBe(25);
    expect(rows.has('user_badges/auth-player_earned-badge')).toBe(true);
    expect(rows.has('user_badges/auth-player_forged-owner-badge')).toBe(false);
  });
  it('rejects old documents retimestamped into today and future-created documents', async () => {
    activity('posts/old', {}, now - 2 * 86_400_000);
    activity('posts/future', {}, now + 1);
    expect((await sync()).current_count).toBe(0);
    expect(rows.has(proofPath)).toBe(false);
  });
  it('does not count another account, deleted content, or aggregate view counts', async () => {
    activity('posts/foreign', { author_id: 'someone-else', view_count: 100_000 });
    activity('posts/deleted', { is_deleted: true });
    expect((await sync()).current_count).toBe(0);
  });
  it('counts actual stories and snap messages from their respective collections', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'story' }));
    activity('stories/story-one');
    expect((await sync()).is_completed).toBe(true);
    rows.delete(proofPath); rows.delete(publicPath);
    rows.set('challenges/daily-post', challenge({ requirement_type: 'snap_sent' }));
    activity('messages/plain', { sender_id: actor.profileId, message_type: 'text' });
    expect((await sync()).is_completed).toBe(false);
    activity('messages/snap', { sender_id: actor.authUid, message_type: 'vybe' });
    expect((await sync()).is_completed).toBe(true);
  });
  it('deduplicates reaction and follow targets rather than counting duplicate rows', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'like', requirement_count: 2 }));
    activity('post_reactions/one', { user_id: actor.profileId, post_id: 'same-target' });
    activity('post_reactions/two', { user_id: actor.authUid, post_id: 'same-target' });
    expect((await sync()).current_count).toBe(1);
  });
  it.each(['like', 'comment', 'follow'])('does not reward nonexistent or self-owned %s targets', async kind => {
    rows.set('challenges/daily-post', challenge({ requirement_type: kind }));
    const source = kind === 'follow' ? 'follows' : kind === 'comment' ? 'comments' : 'post_reactions';
    const owner = kind === 'follow' ? 'follower_id' : 'user_id';
    activity(`${source}/missing`, { [owner]: actor.authUid, post_id: 'missing', following_id: 'missing' });
    activity(`${source}/self`, { [owner]: actor.authUid, post_id: 'self-post', following_id: actor.profileId });
    rows.set('posts/self-post', { author_id: actor.authUid });
    expect((await sync()).is_completed).toBe(false);
    activity(`${source}/valid`, { [owner]: actor.authUid, post_id: 'same-target', following_id: 'other-profile' });
    expect((await sync()).is_completed).toBe(true);
  });
  it('rejects reaction targets with deleted or unbound authors', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'like' }));
    activity('post_reactions/one', { user_id: actor.authUid, post_id: 'same-target' });
    rows.set('posts/same-target', { author_id: 'nonexistent-author' });
    expect((await sync()).is_completed).toBe(false);
    rows.set('posts/same-target', { author_id: 'other-profile', is_deleted: true });
    expect((await sync()).is_completed).toBe(false);
  });
  it('retries and rejects proof if its target disappears before commit', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'like' }));
    activity('post_reactions/one', { user_id: actor.authUid, post_id: 'same-target' });
    beforeCommit = () => rows.delete('posts/same-target');
    expect((await sync()).is_completed).toBe(false);
    expect(rows.has(proofPath)).toBe(false);
    expect(attempts).toBeGreaterThan(1);
  });
  it('uses collision-resistant tuple IDs and refuses a collided public receipt or progress mirror', async () => {
    expect(rewardAuthorityId('a_b', 'c')).not.toBe(rewardAuthorityId('a', 'b_c'));
    activity(); rows.set(publicPath, reward({ user_id: 'other' }));
    await expect(sync()).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.delete(publicPath);
    rows.set('challenge_progress/legacy-player_daily-post', { user_id: 'other', challenge_id: 'daily-post' });
    await expect(sync()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(proofPath)).toBe(false);
  });
  it('counts a saved post, a real invite, a finished profile, and a published music post', async () => {
    rows.set('bookmarks/save-one', { user_id: actor.profileId, post_id: 'same-target', created_at: new Date(now).toISOString() });
    rows.set('challenges/daily-post', challenge({ requirement_type: 'bookmark' }));
    expect((await sync()).is_completed).toBe(true);
    rows.set('challenges/daily-post', challenge({ requirement_type: 'bookmark' }));
    rows.delete('bookmarks/save-one');
    rows.delete(proofPath);
    rows.delete('challenge_progress/legacy-player_daily-post');
    rows.delete(publicPath);
    expect((await sync()).is_completed).toBe(false);

    rows.set('invites/mine', { inviter_id: actor.authUid });
    rows.set('invite_redemptions/join', { invite_id: 'mine', redeemer_id: 'other-profile' });
    rows.set('challenges/daily-post', challenge({ requirement_type: 'invite' }));
    expect((await sync()).is_completed).toBe(true);

    rows.set('challenges/daily-post', challenge({ type: 'achievement', requirement_type: 'complete_profile' }));
    rows.delete(proofPath);
    expect((await sync()).is_completed).toBe(false);
    rows.get(`profiles/${actor.profileId}`)!.username = 'player';
    rows.get(`profiles/${actor.profileId}`)!.display_name = 'Player';
    rows.get(`profiles/${actor.profileId}`)!.onboarding_completed = true;
    expect((await sync()).is_completed).toBe(true);

    activity('posts/song', { caption: 'Ordinary post' });
    rows.set('challenges/daily-post', challenge({ requirement_type: 'music_share' }));
    rows.delete(proofPath);
    rows.delete('challenge_progress/legacy-player_daily-post');
    rows.delete(publicPath);
    expect((await sync()).is_completed).toBe(false);
    rows.get('posts/song')!.caption = 'Listening #music';
    rows.get('_post_publications/song')!.source_fingerprint = postSourceFingerprint(rows.get('posts/song')!);
    expect((await sync()).is_completed).toBe(true);
  });
  it('leaves an undated daily incomplete instead of asking for reconciliation', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'bookmark', active_date: null }));
    rows.set('bookmarks/save-one', { user_id: actor.profileId, post_id: 'same-target', created_at: new Date(now).toISOString() });
    expect((await sync()).is_completed).toBe(false);
    expect(rows.has(proofPath)).toBe(false);
  });
  it('does not trust an inflated login streak for historical login periods', async () => {
    rows.set('challenges/daily-post', challenge({ requirement_type: 'daily_login', active_date: '2026-10-02' }));
    rows.set('login_streaks/auth-player', { current_streak: 1_000, last_login_date: '2026-10-02' });
    expect((await sync()).is_completed).toBe(false);
    rows.set('challenges/daily-post', challenge({ requirement_type: 'daily_login' }));
    expect((await sync()).is_completed).toBe(true);
  });
  it.each([-5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 100_001, '50'])('rejects invalid trusted XP configuration %s without writes', async xp => {
    rows.set('challenges/daily-post', challenge({ reward_xp: xp })); activity();
    await expect(sync()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(proofPath)).toBe(false);
  });
  it('uses one grant for concurrent syncs and never unclaims it during later syncs', async () => {
    activity();
    const results = await Promise.all([sync(), sync(), sync()]);
    expect(results.filter(result => result.newly_completed)).toHaveLength(1);
    await claim(); await sync();
    expect(rows.get(proofPath)?.is_claimed).toBe(true);
    expect(rows.get(publicPath)?.is_claimed).toBe(true);
  });
  it('transaction retries recompute eligibility when the activity is removed', async () => {
    activity(); beforeCommit = () => { rows.delete('posts/post-one'); };
    expect((await sync()).is_completed).toBe(false);
    expect(attempts).toBeGreaterThan(1);
    expect(rows.has(proofPath)).toBe(false);
  });
});

describe('atomic reward consumption and legacy preservation', () => {
  it('concurrent same-reward claims credit once and retain a previous XP balance', async () => {
    activity(); await sync();
    rows.set(levelPath, { user_id: actor.authUid, current_level: 2, total_xp: 100, created_at: 'old', unclaimed_rewards: ['keep'] });
    const results = await Promise.all([claim(), claim(), claim()]);
    expect(results.reduce((sum, result) => sum + result.xp_gained, 0)).toBe(25);
    expect(rows.get(levelPath)).toMatchObject({ total_xp: 125, current_level: 2, created_at: 'old', unclaimed_rewards: ['keep'] });
    expect((await claim()).xp_gained).toBe(0);
  });
  it('concurrent different rewards do not lose each other’s XP updates', async () => {
    activity(); await sync();
    rows.set('challenges/second-post', challenge({ reward_xp: 75 }));
    await reconcileChallenge(database, actor, 'second-post', now);
    await Promise.all([claim(), claim('auth-player_second-post')]);
    expect(rows.get(levelPath)).toMatchObject({ total_xp: 100, current_level: 2 });
  });
  it('a failed commit leaves receipt, level, and badge unchanged; retry credits once', async () => {
    activity(); await sync(); failCommit = true;
    await expect(claim()).rejects.toThrow('commit failure');
    expect(rows.has(levelPath)).toBe(false);
    expect(rows.get(proofPath)?.is_claimed).toBe(false);
    expect(rows.get(publicPath)?.is_claimed).toBe(false);
    expect(rows.has('user_badges/auth-player_earned-badge')).toBe(false);
    failCommit = false;
    expect((await claim()).xp_gained).toBe(25);
    expect((await claim()).xp_gained).toBe(0);
  });
  it('keeps issued proof claimable after source content or its rotated challenge is deleted', async () => {
    activity(); await sync(); rows.delete('posts/post-one'); rows.delete('challenges/daily-post');
    expect((await claim()).xp_gained).toBe(25);
  });
  it('legacy aliases and arbitrary receipt IDs all consume the same authority grant', async () => {
    activity(); rows.set('challenge_rewards/legacy-random', reward({ user_id: actor.profileId }));
    const results = await Promise.all([claim('legacy-random'), claim('legacy-random')]);
    expect(results.reduce((sum, result) => sum + result.xp_gained, 0)).toBe(25);
    expect((await claim()).xp_gained).toBe(0);
  });
  it('settles an alternative legacy receipt after canonical consumption without another XP credit', async () => {
    activity(); await sync(); await claim();
    rows.set('challenge_rewards/second-legacy', reward({ user_id: actor.profileId }));
    expect((await claim('second-legacy')).xp_gained).toBe(0);
    expect(rows.get('challenge_rewards/second-legacy')).toMatchObject({ is_claimed: true, xp_amount: 25, badge_id: 'earned-badge' });
    expect(rows.get(levelPath)?.total_xp).toBe(25);
  });
  it('a previously claimed migrated alias suppresses a fresh canonical award', async () => {
    activity(); rows.set('challenge_rewards/claimed-legacy', reward({ user_id: actor.profileId, is_claimed: true }));
    rows.set(levelPath, { user_id: actor.profileId, total_xp: 55, current_level: 3 });
    await sync();
    expect((await claim()).xp_gained).toBe(0);
    expect(rows.get(levelPath)).toEqual({ user_id: actor.profileId, total_xp: 55, current_level: 3 });
  });
  it('does not guess eligibility for old unclaimed receipts without retained challenge evidence', async () => {
    rows.set(publicPath, reward()); rows.delete('challenges/daily-post');
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.has(levelPath)).toBe(false);
  });
  it('never overwrites a squatted canonical level belonging to another account', async () => {
    activity(); await sync(); rows.set(levelPath, { user_id: 'someone-else', current_level: 1, total_xp: 5_000 });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(levelPath)?.total_xp).toBe(5_000);
    expect(rows.get(proofPath)?.is_claimed).toBe(false);
  });
  it('fails closed on duplicate migrated balances rather than resetting or selecting one', async () => {
    activity(); await sync();
    rows.set(levelPath, { user_id: actor.profileId, current_level: 2, total_xp: 100 });
    rows.set('user_levels/other', { user_id: actor.authUid, current_level: 3, total_xp: 200 });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(rows.get(levelPath)?.total_xp).toBe(100);
  });
  it('rejects a foreign reward and a foreign authority ledger binding', async () => {
    rows.set(publicPath, reward({ user_id: 'someone-else' }));
    await expect(claim()).rejects.toMatchObject({ code: 'permission-denied' });
    rows.set(publicPath, reward()); activity(); await sync();
    rows.set(proofPath, { ...rows.get(proofPath), auth_uid: 'someone-else' });
    await expect(claim()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('preserves an existing badge’s display preferences', async () => {
    activity(); await sync();
    const badge = { user_id: actor.authUid, badge_id: 'earned-badge', is_primary: true, is_pinned: true, earned_at: 'old' };
    rows.set('user_badges/auth-player_earned-badge', badge);
    await claim();
    expect(rows.get('user_badges/auth-player_earned-badge')).toEqual(badge);
  });
});
