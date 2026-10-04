// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { consumeChallengeReward, reconcileChallenge, rewardAuthorityId } from '../../functions/src/_shared/challengeRewardAuthority';

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
}
const sync = () => reconcileChallenge(database, actor, 'daily-post', now);
const claim = (id = 'auth-player_daily-post') => consumeChallengeReward(database, actor, id, now);

beforeEach(() => {
  rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0;
  rows.set('challenges/daily-post', challenge());
  rows.set('battle_pass_tiers/one', { level: 1, xp_required: 0 });
  rows.set('battle_pass_tiers/two', { level: 2, xp_required: 100 });
  rows.set('profiles/other-profile', { user_id: 'other-auth' });
  rows.set('posts/same-target', { author_id: 'other-profile' });
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
