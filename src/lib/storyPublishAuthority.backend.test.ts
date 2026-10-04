// @vitest-environment node
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishStoryWithReceipt, normalizeStoryPublishInput, storyRequestKey, storyStoragePath, STORY_LIFETIME_MS } from '../../functions/src/_shared/storyPublishAuthority';
import { closeFriendAuthorityId, listVisibleStoriesForViewer } from '../../functions/src/_shared/storyReadAuthority';
import { manageVerifiedCloseFriends } from '../../functions/src/_shared/closeFriendAuthority';
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

const media = 'https://firebasestorage.googleapis.com/v0/b/demo-story.appspot.com/o/stories%2Fauth-player%2Fphoto.jpg?alt=media&token=synthetic';
const input = (patch: Row = {}) => ({ requestId: 'draft-one', expectedOwnerUid: actor.authUid, mediaUrl: media, mediaType: 'image', caption: 'hello', ...patch });
const verify = vi.fn(async () => undefined);
const publish = (patch: Row = {}, time = now) => publishStoryWithReceipt(database, actor.authUid, input(patch), verify, time);
const key = () => storyRequestKey(actor.authUid, 'draft-one', 'my_story');
const storyPath = () => `stories/story_${key()}`;
const receiptPath = () => `_story_publish_receipts/${key()}`;
beforeEach(() => { rows.clear(); created.clear(); beforeCommit = null; failCommit = false; attempts = 0; verify.mockReset(); verify.mockResolvedValue(undefined);
  rows.set(`profiles/${actor.profileId}`, { user_id: actor.authUid, username: 'player' });
  rows.set(`user_auth_index/${actor.authUid}`, { profile_id: actor.profileId });
});

describe('trusted story publication receipts', () => {
  it('atomically derives owner, times/count and a deterministic receipt, then returns one live story on replay', async () => {
    const first = await publish(); const original = structuredClone(rows.get(storyPath()));
    const second = await publish();
    expect(first.created).toBe(true); expect(second.created).toBe(false); expect(first.storyId).toBe(second.storyId);
    expect(rows.get(storyPath())).toEqual(original); expect(original).toMatchObject({ author_id: actor.profileId, view_count: 0, created_at: new Date(now).toISOString(), expires_at: new Date(now + STORY_LIFETIME_MS).toISOString() });
    expect(verify).toHaveBeenCalledTimes(1); expect(rows.get(receiptPath())).toMatchObject({ owner_uid: actor.authUid, profile_id: actor.profileId, story_id: first.storyId });
    expect([...rows.keys()].filter(path => path.startsWith('stories/'))).toHaveLength(1);
  });
  it('serializes concurrent same-key requests and charges the quota once', async () => {
    const results = await Promise.all([publish(), publish(), publish()]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(new Set(results.map(result => result.storyId)).size).toBe(1);
    expect([...rows.entries()].find(([path]) => path.startsWith('_story_publish_limits/'))?.[1].count).toBe(1);
  });
  it.each([{ caption: 'changed' }, { mediaUrl: media.replace('photo', 'other') }, { duration: 30 }, { pollData: { type: 'question', question: 'Why?', options: [] } }])('rejects changed content on an existing request: %o', async patch => {
    await publish(); const before = structuredClone(rows.get(storyPath())); await expect(publish(patch)).rejects.toMatchObject({ code: 'already-exists' }); expect(rows.get(storyPath())).toEqual(before);
  });
  it('never recreates a deleted or soft-deleted story, even if the original upload disappeared', async () => {
    await publish(); rows.delete(storyPath()); verify.mockRejectedValue(new Error('upload was deleted'));
    expect(await publish()).toMatchObject({ status: 'deleted', created: false, story: null }); expect(rows.has(storyPath())).toBe(false); expect(verify).toHaveBeenCalledTimes(1);
  });
  it('returns expired without extending expiry or recreating the story', async () => {
    await publish(); rows.delete(storyPath());
    expect(await publish({}, now + STORY_LIFETIME_MS)).toMatchObject({ status: 'expired', created: false, story: null }); expect(rows.has(storyPath())).toBe(false);
  });
  it('observes deletion racing an in-flight replay transaction', async () => {
    await publish(); beforeCommit = () => rows.delete(storyPath());
    expect(await publish()).toMatchObject({ status: 'deleted', story: null }); expect(rows.has(storyPath())).toBe(false); expect(attempts).toBeGreaterThan(2);
  });
  it('does not leave a receipt or story after an atomic commit failure; the same intent can retry', async () => {
    failCommit = true; await expect(publish()).rejects.toThrow('commit failure'); expect(rows.has(storyPath())).toBe(false); expect(rows.has(receiptPath())).toBe(false);
    failCommit = false; expect((await publish()).created).toBe(true);
  });
  it('fails closed on receipt/story squatting or rebound ownership', async () => {
    rows.set(storyPath(), { author_id: 'someone-else' }); await expect(publish()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.delete(storyPath());
    await publish(); rows.set(receiptPath(), { ...rows.get(receiptPath()), owner_uid: 'someone-else' }); await expect(publish()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('revalidates unique live profile mapping inside transaction retries', async () => {
    beforeCommit = () => rows.set('profiles/ambiguous', { user_id: actor.authUid });
    await expect(publish()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(rows.has(storyPath())).toBe(false); expect(rows.has(receiptPath())).toBe(false);
  });
  it('rejects a legacy profile alias that collides with another account UID', async () => {
    rows.set('profiles/another-account', { user_id: actor.profileId });
    await expect(publish()).rejects.toMatchObject({ code: 'failed-precondition' }); expect(rows.has(storyPath())).toBe(false);
  });
  it('rejects a mismatched expected profile and preserves supported audience/poll fields', async () => {
    await expect(publish({ authorId: 'foreign-profile' })).rejects.toMatchObject({ code: 'failed-precondition' });
    const result = await publish({ isCloseFriendsOnly: true, aspectRatio: 0.75, duration: 12, pollData: { type: 'poll', question: 'Pick', options: ['A', 'B'] } });
    expect(result.story).toMatchObject({ is_close_friends_only: true, aspect_ratio: 0.75, duration: 12, poll_data: { type: 'poll', question: 'Pick', options: ['A', 'B'] } });
  });
  it('keeps same request IDs isolated by account and destination without concatenation collisions', async () => {
    expect(storyRequestKey('a_b', 'c', 'my_story')).not.toBe(storyRequestKey('a', 'b_c', 'my_story'));
    const own = await publish(); const close = await publish({ isCloseFriendsOnly: true }); expect(own.storyId).not.toBe(close.storyId);
    rows.set('profiles/bob-profile', { user_id: 'bob' });
    const other = await publishStoryWithReceipt(database, 'bob', input({ expectedOwnerUid: 'bob' }), verify, now); expect(other.storyId).not.toBe(own.storyId);
  });
  it('enforces a per-owner daily cap while allowing replay of an already issued receipt', async () => {
    await publish(); const quotaPath = [...rows.keys()].find(path => path.startsWith('_story_publish_limits/'))!;
    rows.set(quotaPath, { ...rows.get(quotaPath), count: 50 });
    await expect(publish({ requestId: 'another' })).rejects.toMatchObject({ code: 'resource-exhausted' }); expect((await publish()).created).toBe(false);
    expect((await publish({ requestId: 'tomorrow' }, now + STORY_LIFETIME_MS)).created).toBe(true);
  });
});

describe('story request and upload validation', () => {
  it('accepts the exact local preview proxy only in the configured demo emulator', () => {
    const previous = process.env.GCLOUD_PROJECT;
    const url = media.replace('https://firebasestorage.googleapis.com', 'http://127.0.0.1:8082');
    try {
      process.env.GCLOUD_PROJECT = 'demo-vybe-preview';
      expect(storyStoragePath(url, actor.authUid, 'demo-story.appspot.com', '127.0.0.1:9399')).toBe('stories/auth-player/photo.jpg');
      expect(() => storyStoragePath(url, actor.authUid, 'demo-story.appspot.com')).toThrow();
      expect(() => storyStoragePath(url.replace('8082', '8083'), actor.authUid, 'demo-story.appspot.com', '127.0.0.1:9399')).toThrow();
      process.env.GCLOUD_PROJECT = 'production';
      expect(() => storyStoragePath(url, actor.authUid, 'demo-story.appspot.com', '127.0.0.1:9399')).toThrow();
    } finally { if (previous === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = previous; }
  });
  it.each([{ expectedOwnerUid: undefined }, { expectedOwnerUid: 'bob' }, { expectedOwnerUid: null }])('rejects missing/wrong owner before media work: %o', async patch => {
    await expect(publish(patch)).rejects.toMatchObject({ code: 'failed-precondition' }); expect(verify).not.toHaveBeenCalled();
  });
  it.each([{ requestId: '../bad' }, { caption: 'x'.repeat(2201) }, { duration: Infinity }, { duration: 61 }, { aspectRatio: 0 }, { mediaType: 'audio' }, { expires_at: 'forged' }, { author_id: 'forged' }, { isCloseFriendsOnly: 'false' }, { pollData: { type: 'poll', question: 'Hi', options: ['only-one'] } }, { pollData: { type: 'question', question: 'Hi', options: ['unexpected'] } }])('rejects forged or out-of-range fields: %o', patch => {
    expect(() => normalizeStoryPublishInput(input(patch), actor.authUid)).toThrow();
  });
  it('accepts only matching configured-bucket owner paths and rejects foreign, external or traversal paths', () => {
    expect(storyStoragePath(media, actor.authUid, 'demo-story.appspot.com')).toBe('stories/auth-player/photo.jpg');
    expect(storyStoragePath('gs://chat-media/auth-player/snap.jpg', actor.authUid, 'demo-story.appspot.com')).toBe('chat-media/auth-player/snap.jpg');
    for (const url of [media.replace('auth-player', 'bob'), media.replace('demo-story', 'foreign'), 'https://example.com/photo.jpg', 'https://firebasestorage.googleapis.com.evil.test/photo.jpg', 'gs://stories/auth-player/../other.jpg', 'gs://public/auth-player/photo.jpg']) {
      expect(() => storyStoragePath(url, actor.authUid, 'demo-story.appspot.com')).toThrow();
    }
  });
});

describe('server-authorized story audience', () => {
  const resolveMedia = vi.fn(async (url: string) => url);
  const list = (patch: Row = {}) => listVisibleStoriesForViewer(database, actor.authUid, { expectedOwnerUid: actor.authUid, expectedProfileId: actor.profileId, ...patch }, resolveMedia, now);
  const addAuthor = (name = 'bob', accepted = true) => {
    rows.set(`profiles/${name}-profile`, { user_id: name, username: name });
    if (accepted) rows.set(`friend_requests/${name}`, { sender_id: actor.profileId, receiver_id: `${name}-profile`, status: 'accepted' });
    return `${name}-profile`;
  };
  const addStory = (id: string, author = 'bob-profile', close = false, patch: Row = {}) => rows.set(`stories/${id}`, {
    author_id: author, media_url: `gs://stories/${author}/photo.jpg`, media_type: 'image', is_close_friends_only: close,
    created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 1000).toISOString(), ...patch,
  });
  beforeEach(() => resolveMedia.mockClear());
  it('shows self and accepted ordinary friends but never strangers, including targeted IDs and author mode', async () => {
    addAuthor(); addAuthor('stranger', false); addStory('friend'); addStory('private', 'bob-profile', true); addStory('unknown', 'stranger-profile'); addStory('self', actor.profileId, true);
    expect((await list()).stories.map(row => row.id).sort()).toEqual(['friend', 'self']);
    expect((await list({ storyIds: ['friend', 'private', 'unknown'] })).stories.map(row => row.id)).toEqual(['friend']);
    expect((await list({ authorId: 'stranger-profile' })).stories).toEqual([]);
    expect((await list({ authorId: 'bob' })).stories.map(row => row.id)).toEqual(['friend']);
  });
  it('requires the author-owned grant and immediately observes removal or unfriend', async () => {
    addAuthor(); addStory('private', 'bob-profile', true);
    rows.set('close_friends/forged', { user_id: actor.profileId, friend_id: 'bob-profile' });
    expect((await list()).stories).toEqual([]);
    rows.set('close_friends/grant', { user_id: 'bob', friend_id: actor.profileId });
    expect((await list()).stories).toEqual([]); // Historical tuples are never authority.
    const proofPath = `_close_friend_authority/${closeFriendAuthorityId('bob', actor.authUid)}`;
    rows.set(proofPath, { version: 1, owner_uid: 'bob', owner_profile_id: 'bob-profile', friend_uid: actor.authUid, friend_profile_id: actor.profileId, enabled: true });
    expect((await list()).stories.map(row => row.id)).toEqual(['private']);
    beforeCommit = () => rows.set(proofPath, { ...rows.get(proofPath), enabled: false });
    expect((await list()).stories).toEqual([]);
    rows.set('close_friends/grant', { user_id: 'bob-profile', friend_id: actor.authUid }); rows.delete('friend_requests/bob');
    expect((await list({ storyIds: ['private'] })).stories).toEqual([]);
  });
  it('rejects current viewer profile changes, duplicate mappings and alias borrowing', async () => {
    await expect(list({ expectedOwnerUid: 'bob' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(list({ expectedProfileId: 'old-profile' })).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set('profiles/duplicate', { user_id: actor.authUid });
    await expect(list()).rejects.toMatchObject({ code: 'failed-precondition' }); rows.delete('profiles/duplicate');
    rows.set('profiles/foreign', { user_id: actor.profileId });
    await expect(list()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not borrow ambiguous author grants or return expired, deleted, future or malformed audience records', async () => {
    addAuthor(); addStory('okay'); addStory('expired', 'bob-profile', false, { expires_at: new Date(now).toISOString() });
    addStory('deleted', 'bob-profile', false, { is_deleted: true }); addStory('future', 'bob-profile', false, { created_at: new Date(now + 100).toISOString() });
    addStory('unknown-audience', 'bob-profile', false, { is_close_friends_only: undefined });
    expect((await list({ storyIds: ['okay', 'expired', 'deleted', 'future', 'unknown-audience', 'missing'] })).stories.map(row => row.id)).toEqual(['okay']);
    rows.set('profiles/collision', { user_id: 'bob-profile' }); expect((await list()).stories).toEqual([]);
  });
  it('paginates authors even when one page has no stories and does not accept cursor as authority', async () => {
    for (let i = 0; i < 22; i++) addAuthor(`friend-${String(i).padStart(2, '0')}`);
    addStory('last', 'friend-21-profile');
    const first = await list(); expect(first.stories).toEqual([]); expect(first.nextCursor).toBe('friend-08-profile');
    const second = await list({ cursor: first.nextCursor }); expect(second.stories).toEqual([]); expect(second.nextCursor).toBe('friend-18-profile');
    const third = await list({ cursor: second.nextCursor }); expect(third.stories.map(row => row.id)).toEqual(['last']); expect(third.nextCursor).toBeNull();
    await expect(list({ cursor: 'friend', authorId: 'bob' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('does not resolve unauthorized media or return internal fields, and skips unavailable uploads', async () => {
    addAuthor(); addStory('private', 'bob-profile', true); addStory('ordinary', 'bob-profile', false, { publish_receipt_id: 'secret', internal: true });
    const result = await list(); expect(resolveMedia).toHaveBeenCalledTimes(1); expect(result.stories[0]).not.toHaveProperty('publish_receipt_id'); expect(result.stories[0]).not.toHaveProperty('internal');
    resolveMedia.mockResolvedValueOnce(null as unknown as string); expect((await list()).stories).toEqual([]);
  });
  it.each([false, true])('blocks both relationship directions despite retained acceptance, reversed=%s', async reversed => {
    addAuthor(); addStory('ordinary'); addStory('private', 'bob-profile', true); rows.set('close_friends/grant', { user_id: 'bob', friend_id: actor.authUid });
    rows.set('blocked_users/block', { blocker_id: reversed ? 'bob-profile' : actor.authUid, blocked_id: reversed ? actor.profileId : 'bob' });
    expect((await list()).stories).toEqual([]); expect((await list({ authorId: 'bob' })).stories).toEqual([]);
    expect((await list({ storyIds: ['ordinary', 'private'] })).stories).toEqual([]); expect(resolveMedia).not.toHaveBeenCalled();
  });
  it('does not let midnight quota overlap or excess legacy rows make the entire feed unavailable', async () => {
    addAuthor(); for (let i = 0; i < 110; i++) addStory(`story-${i}`);
    expect((await list()).stories).toHaveLength(100);
    await expect(listVisibleStoriesForViewer(database, actor.authUid, { expectedOwnerUid: actor.authUid, expectedProfileId: actor.profileId }, resolveMedia, NaN)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('drops unbounded or malformed legacy DTO fields instead of forwarding arbitrary poll payloads', async () => {
    addAuthor(); addStory('valid');
    const malformed = [{ poll_data: { type: 'poll', question: 'x'.repeat(101), options: ['A', 'B'] } }, { poll_data: { payload: 'x'.repeat(100000) } }, { media_url: 'x'.repeat(8193) }, { thumbnail_url: 'x'.repeat(8193) }, { caption: 'x'.repeat(2201) }, { aspect_ratio: Infinity }, { duration: -1 }, { created_at: [new Date(now - 1000).toISOString()] }, { created_at: '10/03/2026' }];
    malformed.forEach((patch, i) => addStory(`bad-${i}`, 'bob-profile', false, patch));
    expect((await list()).stories.map(row => row.id)).toEqual(['valid']);
  });
  it('honors profile story denials across feed, author and direct selections, without hiding self', async () => {
    addAuthor(); addStory('ordinary'); rows.set('profile_visibility/bob-profile', { fields: { stories: 'only_me' } });
    expect((await list()).stories).toEqual([]); expect((await list({ authorId: 'bob' })).stories).toEqual([]); expect((await list({ storyIds: ['ordinary'] })).stories).toEqual([]);
    rows.set('profile_visibility/bob-profile', { fields: { stories: 'close_friends' } }); expect((await list()).stories).toEqual([]);
    rows.set(`_close_friend_authority/${closeFriendAuthorityId('bob', actor.authUid)}`, { version: 1, owner_uid: 'bob', owner_profile_id: 'bob-profile', friend_uid: actor.authUid, friend_profile_id: actor.profileId, enabled: true });
    expect((await list()).stories.map(row => row.id)).toEqual(['ordinary']);
    addStory('self', actor.profileId); rows.set(`profile_visibility/${actor.profileId}`, { fields: { stories: 'only_me' } }); expect((await list()).stories.map(row => row.id)).toContain('self');
  });
});

describe('verified close-friend management', () => {
  const manage = (patch: Row = {}) => manageVerifiedCloseFriends(database, actor.authUid, { action: 'list', expectedOwnerUid: actor.authUid, expectedProfileId: actor.profileId, ...patch }, now);
  const proofPath = () => `_close_friend_authority/${closeFriendAuthorityId(actor.authUid, 'bob')}`;
  beforeEach(() => {
    rows.set('profiles/bob-profile', { user_id: 'bob', username: 'Bob' });
    rows.set('friend_requests/bob', { sender_id: actor.profileId, receiver_id: 'bob', status: 'accepted' });
  });
  it('lists historical selections as needing review without granting or automatically importing them', async () => {
    rows.set('close_friends/forged', { user_id: actor.profileId, friend_id: 'bob-profile' });
    expect(await manage()).toMatchObject({ friends: [], legacyReview: true, candidates: [{ id: 'bob-profile' }] });
    expect(rows.has(proofPath())).toBe(false);
  });
  it('adds only the authenticated owner’s current canonical friend and removes with a retained negative proof', async () => {
    await manage({ action: 'add', friendId: 'bob' });
    expect(rows.get(proofPath())).toMatchObject({ owner_uid: actor.authUid, owner_profile_id: actor.profileId, friend_uid: 'bob', friend_profile_id: 'bob-profile', enabled: true });
    expect(await manage()).toMatchObject({ friends: [{ id: closeFriendAuthorityId(actor.authUid, 'bob'), friend: { id: 'bob-profile' } }] });
    const issued = rows.get(proofPath())?.created_at;
    await manage({ action: 'add', friendId: 'bob-profile' }); expect(rows.get(proofPath())?.created_at).toBe(issued);
    await manage({ action: 'remove', friendId: 'bob-profile' }); expect(rows.get(proofPath())?.enabled).toBe(false); expect(await manage()).toMatchObject({ friends: [] });
  });
  it('rejects wrong owner/profile, self, missing, ambiguous or blocked targets without grants', async () => {
    for (const patch of [{ expectedOwnerUid: 'bob' }, { expectedProfileId: 'bob-profile' }, { friendId: actor.profileId }, { friendId: 'missing' }]) await expect(manage({ action: 'add', friendId: 'bob', ...patch })).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set('blocked_users/block', { blocker_id: 'bob-profile', blocked_id: actor.authUid });
    await expect(manage({ action: 'add', friendId: 'bob' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await manage()).toMatchObject({ candidates: [] }); expect(rows.has(proofPath())).toBe(false);
  });
  it('rechecks friendship revocation during the grant transaction', async () => {
    beforeCommit = () => rows.delete('friend_requests/bob');
    await expect(manage({ action: 'add', friendId: 'bob' })).rejects.toMatchObject({ code: 'permission-denied' }); expect(rows.has(proofPath())).toBe(false);
  });
  it('keeps concurrently added grants and derives collision-resistant tuple IDs', async () => {
    rows.set('profiles/cara-profile', { user_id: 'cara' }); rows.set('friend_requests/cara', { sender_id: actor.authUid, receiver_id: 'cara-profile', status: 'accepted' });
    await Promise.all([manage({ action: 'add', friendId: 'bob' }), manage({ action: 'add', friendId: 'cara' })]);
    expect(await manage()).toMatchObject({ friends: expect.arrayContaining([expect.objectContaining({ friend: expect.objectContaining({ id: 'bob-profile' }) }), expect.objectContaining({ friend: expect.objectContaining({ id: 'cara-profile' }) })]) });
    expect(closeFriendAuthorityId('a_b', 'c')).not.toBe(closeFriendAuthorityId('a', 'b_c'));
  });
  it('keeps an unavailable target removable without trusting a new profile owner or foreign proof', async () => {
    await manage({ action: 'add', friendId: 'bob' }); rows.delete('profiles/bob-profile');
    expect(await manage()).toMatchObject({ friends: [{ friend: { id: 'bob-profile', display_name: 'Unavailable account' } }] });
    await manage({ action: 'remove', friendId: 'bob-profile' }); expect(rows.get(proofPath())?.enabled).toBe(false);
    await expect(manage({ action: 'remove', friendId: 'unknown' })).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set(proofPath(), { ...rows.get(proofPath()), owner_uid: 'foreign' });
    await expect(manage({ action: 'remove', friendId: 'bob' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
