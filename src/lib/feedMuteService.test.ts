import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice', epoch: 0, rows: new Map<string, Record<string, unknown>>(), writes: vi.fn(), reads: vi.fn(), afterRead: undefined as undefined | (() => void), beforeCommit: undefined as undefined | (() => void) }));
const snapshot = (path: string, value = state.rows.get(path)) => ({ id: path.split('/').at(-1)!, exists: () => value !== undefined, data: () => value });
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }),
  reportAccountGuard: () => { const uid = state.uid; const epoch = state.epoch; return () => { if (!uid || state.uid !== uid || state.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; },
  isReportSessionError: () => false,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'), collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  documentId: () => '__name__', orderBy: (field: string) => ({ order: field }), limit: (count: number) => ({ limit: count }),
  where: (field: string, _operator: string, value: string) => ({ where: [field, value] }), startAfter: (cursor: { id: string }) => ({ cursor: cursor.id }),
  query: (path: string, ...conditions: Record<string, unknown>[]) => ({ path, conditions }), serverTimestamp: () => 'SERVER_TIME',
  getDocFromServer: async (path: string) => { state.reads(path); const result = snapshot(path); state.afterRead?.(); return result; },
  getDocsFromServer: async ({ path, conditions }: { path: string; conditions: { limit?: number; cursor?: string; where?: string[] }[] }) => {
    state.reads(path); let found = [...state.rows].filter(([key]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'));
    for (const condition of conditions) {
      if (condition.where) found = found.filter(([, row]) => row[condition.where![0]] === condition.where![1]);
      if (condition.cursor) found = found.filter(([key]) => key.split('/').at(-1)! > condition.cursor!);
    }
    found.sort(([a], [b]) => a.localeCompare(b)); found = found.slice(0, conditions.find(condition => condition.limit)?.limit);
    const result = { size: found.length, docs: found.map(([key, value]) => snapshot(key, value)) }; state.afterRead?.(); return result;
  },
  runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<void>) => {
    const queued: (() => void)[] = [];
    await run({ get: async (path: string) => snapshot(path),
      set: (path: string, value: Record<string, unknown>) => queued.push(() => { state.writes('set', path, value); state.rows.set(path, value); }),
      delete: (path: string) => queued.push(() => { state.writes('delete', path); state.rows.delete(path); }),
    });
    for (const commit of queued) commit(); state.beforeCommit?.();
  },
}));
import { filterMutedPosts, listFeedMutes, mutedAuthorIds, removeFeedMute, saveFeedMute } from './feedMuteService';

const record = (profileId = 'bob-profile', uid = 'bob') => ({ schema_version: 1, owner_uid: 'alice', target_profile_id: profileId, target_uid: uid, created_at: 'SERVER_TIME' });
beforeEach(() => { state.uid = 'alice'; state.epoch = 0; state.rows.clear(); state.writes.mockClear(); state.reads.mockClear(); state.afterRead = undefined; state.beforeCommit = undefined; state.rows.set('profiles/bob-profile', { user_id: 'bob' }); });

describe('durable private feed mutes', () => {
  it('resolves a migrated UID, writes the canonical target once, and safely retries', async () => {
    await expect(saveFeedMute('bob')).resolves.toEqual({ profileId: 'bob-profile', uid: 'bob' });
    await saveFeedMute('bob-profile');
    expect(state.writes).toHaveBeenCalledExactlyOnceWith('set', 'feed_mutes/alice/authors/bob-profile', record());
    expect(state.rows.has('blocked_users')).toBe(false);
  });
  it('rejects missing, ambiguous and self targets without writes', async () => {
    await expect(saveFeedMute('missing')).rejects.toThrow('could not be verified');
    state.rows.set('profiles/duplicate', { user_id: 'bob' });
    await expect(saveFeedMute('bob')).rejects.toThrow('could not be verified');
    state.rows.set('profiles/alice-profile', { user_id: 'alice' });
    await expect(saveFeedMute('alice-profile')).rejects.toThrow('own account');
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('verifies the target again inside the write transaction', async () => {
    state.afterRead = () => state.rows.set('profiles/bob-profile', { user_id: 'changed' });
    await expect(saveFeedMute('bob-profile')).rejects.toThrow('account changed');
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('does not overwrite malformed existing mute bindings', async () => {
    state.rows.set('feed_mutes/alice/authors/bob-profile', { ...record(), owner_uid: 'mallory' });
    await expect(saveFeedMute('bob-profile')).rejects.toThrow('could not be verified');
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('stops an account switch or ABA epoch before any write', async () => {
    state.afterRead = () => { state.epoch++; };
    await expect(saveFeedMute('bob-profile')).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('suppresses current-account success if the account changes after the server committed', async () => {
    state.beforeCommit = () => { state.uid = 'other'; };
    await expect(saveFeedMute('bob-profile')).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.rows.get('feed_mutes/alice/authors/bob-profile')).toEqual(record());
    expect(state.rows.has('feed_mutes/other/authors/bob-profile')).toBe(false);
  });
  it('unmutes a deleted account and accepts a missing-row retry', async () => {
    state.rows.delete('profiles/bob-profile'); state.rows.set('feed_mutes/alice/authors/bob-profile', record());
    await removeFeedMute('bob-profile'); await removeFeedMute('bob-profile');
    expect(state.writes).toHaveBeenCalledExactlyOnceWith('delete', 'feed_mutes/alice/authors/bob-profile');
  });
  it('loads all pages rather than dropping muted authors after the first 200', async () => {
    for (let index = 0; index < 205; index++) { const id = `profile-${String(index).padStart(3, '0')}`; state.rows.set(`feed_mutes/alice/authors/${id}`, record(id, `uid-${index}`)); }
    const rows = await listFeedMutes();
    expect(rows).toHaveLength(205); expect(rows.at(-1)).toEqual({ profileId: 'profile-204', uid: 'uid-204' });
    expect(state.reads).toHaveBeenCalledTimes(2);
  });
  it('returns removable path-only repair records and rejects account switches during pagination', async () => {
    state.rows.set('feed_mutes/alice/authors/bob-profile', { ...record(), target_profile_id: 'other' });
    const broken = await listFeedMutes();
    expect(broken).toEqual([{ profileId: 'bob-profile', uid: '', needsRepair: true }]);
    expect(mutedAuthorIds(broken).size).toBe(0);
    await removeFeedMute(broken[0].profileId);
    expect(state.rows.has('feed_mutes/alice/authors/bob-profile')).toBe(false);
    state.rows.set('feed_mutes/alice/authors/bob-profile', record()); state.afterRead = () => { state.uid = 'bob'; };
    await expect(listFeedMutes()).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('filters profile and UID authors without mutating feed input', () => {
    const posts = [{ author: { id: 'bob' } }, { author: { id: 'bob-profile' } }, { author_id: 'bob' }, { author: { id: 'other' } }];
    expect(filterMutedPosts(posts, mutedAuthorIds([{ profileId: 'bob-profile', uid: 'bob' }]))).toEqual([posts[3]]);
    expect(posts).toHaveLength(4);
  });
});
