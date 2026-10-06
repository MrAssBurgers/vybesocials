// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { exportAccountPage, accountExportSections } from '../../functions/src/_shared/accountExportAuthority';
const rows = new Map<string, Record<string, unknown>>();
const users = new Map<string, any>();
const versions = new Map<string, number>();
const ref = (path: string): any => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
const snapshot = (path: string): any => ({ id: path.split('/').at(-1), exists: rows.has(path), ref: ref(path), data: () => structuredClone(rows.get(path)),
  createTime: { nanoseconds: 0, toDate: () => new Date('2026-01-02T00:00:00Z') }, updateTime: { nanoseconds: versions.get(path) ?? 0, toDate: () => new Date('2026-01-02T00:00:00Z') } });
const query = (collection: string, filters: any[] = [], size = 99, after = ''): any => ({ where: (key: string, op: string, value: unknown) => query(collection, [...filters, [key, op, value]], size, after), limit: (max: number) => query(collection, filters, max, after), orderBy: () => query(collection, filters, size, after), startAfter: (cursor: string) => query(collection, filters, size, cursor), get: async () => {
  const docs = [...rows.entries()].filter(([path, row]) => path.startsWith(collection + '/') && path.split('/').at(-1)! > after && filters.every(([key, op, value]) => op === 'in' ? value.includes(row[key]) : value === row[key])).sort(([a],[b]) => a.localeCompare(b)).slice(0, size).map(([path]) => snapshot(path)); return { docs, size: docs.length, empty: !docs.length };
} });
const database: any = { doc: ref, collection: (name: string) => ({ ...query(name), doc: (id: string) => ref(name + '/' + id) }), runTransaction: async (run: any) => {
  const writes: any[] = []; const result = await run({ get: (target: any) => target.get(), getAll: (...targets: any[]) => Promise.all(targets.map(target => target.get())),
    create: (target: any, data: any) => { if (rows.has(target.path)) throw new Error('Already exists'); writes.push(['set', target.path, structuredClone(data)]); },
    set: (target: any, data: any) => writes.push(['set', target.path, structuredClone(data)]), delete: (target: any) => writes.push(['delete', target.path]) });
  for (const [action, path, data] of writes) { if (action === 'delete') rows.delete(path); else rows.set(path, data); versions.set(path, (versions.get(path) ?? 0) + 1); } return result;
} };
const auth: any = { getUser: async (uid: string) => { if (!users.has(uid)) throw Object.assign(new Error('Absent'), { code: 'auth/user-not-found' }); return structuredClone(users.get(uid)); } };

const created = Date.parse('2026-01-01T00:00:00Z');
const request = (section = 'profile', after: string | null = null, extra = {}) => ({ auth: { uid: 'alice', token: { auth_time: created / 1000 } }, data: { action: 'export', requestId: '00000000-0000-4000-8000-000000000001', section, after, expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: created, ...extra } });
const run = (section = 'profile', after: string | null = null, extra = {}) => exportAccountPage(database, auth, request(section, after, extra) as never);
beforeEach(() => {
  rows.clear(); users.clear(); versions.clear();
  users.set('alice', { uid: 'alice', disabled: false, metadata: { creationTime: '2026-01-01T00:00:00Z' } });
  rows.set('profiles/profile-alice', { user_id: 'alice', username: 'alice', private_staff_note: 'secret' });
  rows.set('_account_profile_bindings/alice', { version: 1, owner_uid: 'alice', profile_id: 'profile-alice', auth_created_at_ms: created, status: 'active', revision: 'a'.repeat(48) });
});
describe('actual personal export authority', () => {
  it('projects the verified canonical profile and complete section manifest without any writes', async () => {
    const before = structuredClone([...rows]); const result = await run();
    expect(result.records).toEqual([{ id: 'profile-alice', user_id: 'alice', username: 'alice' }]);
    expect(result.sections).toEqual(Object.keys(accountExportSections)); expect([...rows]).toEqual(before);
  });
  it('exports every page after 50 records and excludes peer posts and arbitrary fields', async () => {
    for (let i = 0; i < 57; i++) rows.set(`posts/p${String(i).padStart(3,'0')}`, { author_id: 'profile-alice', caption: String(i), admin_note: 'secret' });
    rows.set('posts/peer', { author_id: 'profile-bob', caption: 'other' });
    const first = await run('posts'); const next = await run('posts', first.nextAfter as string);
    expect(first.records).toHaveLength(50); expect(next.records).toHaveLength(7); expect(next.nextAfter).toBeNull();
    expect(first.records[0]).toEqual({ id: 'p000', author_id: 'profile-alice', caption: '0' });
  });
  it.each(['posts', 'legacy_posts', 'comments', 'legacy_comments', 'messages', 'channel_messages', 'stories', 'legacy_stories'])('rejects contradictory %s authorship without returning data', async section => {
    const spec = accountExportSections[section as keyof typeof accountExportSections];
    rows.set(`${spec.collection}/conflict`, { [spec.owner!]: 'profile-alice', owner_uid: 'bob', content: 'private' });
    await expect(run(section)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('does not include other people’s incoming message bodies', async () => {
    rows.set('messages/own', { sender_id: 'profile-alice', conversation_id: 'c', content: 'mine' });
    rows.set('messages/incoming', { sender_id: 'profile-bob', recipient_id: 'profile-alice', content: 'peer private' });
    expect((await run('messages')).records).toEqual([{ id: 'own', sender_id: 'profile-alice', conversation_id: 'c', content: 'mine' }]);
  });
  it.each(['deleted', 'expired'])('keeps %s content unavailable in an export', async kind => {
    rows.set('messages/own', { sender_id: 'profile-alice', content: 'removed', media_url: 'https://example.test/private', ...(kind === 'deleted' ? { is_deleted: true } : { expires_at: '2020-01-01' }) });
    expect((await run('messages')).records[0]).not.toHaveProperty('content'); expect((await run('messages')).records[0]).not.toHaveProperty('media_url');
  });
  it.each(['disabled', 'recreated', 'revoked', 'retired-binding', 'alias-account'])('rejects %s authority', async kind => {
    if (kind === 'disabled') users.get('alice').disabled = true;
    if (kind === 'recreated') users.get('alice').metadata.creationTime = '2026-02-01';
    if (kind === 'revoked') users.get('alice').tokensValidAfterTime = '2026-02-01';
    if (kind === 'retired-binding') rows.get('_account_profile_bindings/alice')!.status = 'retired';
    if (kind === 'alias-account') users.set('profile-alice', { uid: 'profile-alice' });
    await expect(run()).rejects.toBeDefined();
  });
  it('rejects previous-incarnation metadata and ambiguous older UID rows', async () => {
    rows.set('messages/old', { sender_id: 'alice', created_at: '2020-01-01', content: 'old owner' });
    await expect(run('messages')).rejects.toMatchObject({ code: 'failed-precondition' });
    rows.set('messages/old', { sender_id: 'profile-alice', auth_created_at_ms: created-1 });
    await expect(run('messages')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('limits bytes without truncating a record and continues with the final included ID', async () => {
    for (let i = 0; i < 4; i++) rows.set(`posts/${i}`, { author_id: 'profile-alice', caption: 'x'.repeat(800000) });
    const first = await run('posts'); expect(first.records).toHaveLength(2); expect(first.nextAfter).toBe('1');
    const next = await run('posts','1'); expect(next.records).toHaveLength(2); expect(next.nextAfter).toBeNull();
  });
  it.each([{ section: '_auth_email_challenges' }, { after: '../secret' }, { requestId: 'bad' }, { expectedOwnerUid: 'bob' }, { expectedProfileId: 'profile-bob' }])('rejects arbitrary or mismatched input %j', async extra => {
    await expect(run('profile', null, extra)).rejects.toBeDefined();
  });
});
