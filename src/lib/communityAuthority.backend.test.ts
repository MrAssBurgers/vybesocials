// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>(), writes: [] as string[], next: 0, mints: 0,
  grants: [] as Row[], failWrite: '', afterRead: null as ((key: string) => void) | null }));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const ref = (path: string) => ({
    path, id: path.split('/').at(-1)!,
    read: () => state.rows.get(path),
    get: async () => snapshot(path),
    set: async (value: Row) => { state.rows.set(path, structuredClone(value)); state.writes.push(path); },
  });
  const snapshot = (path: string) => {
    const value = structuredClone(state.rows.get(path));
    return { ref: ref(path), id: path.split('/').at(-1)!, exists: value !== undefined, data: () => value };
  };
  const query = (name: string, filters: Array<[string, string, unknown]> = [], limit = Infinity) => {
    const entries = () => [...state.rows.entries()].filter(([path, row]) => path.startsWith(`${name}/`)
      && path.split('/').length === name.split('/').length + 1 && filters.every(([field, op, value]) => op === 'in' ? (value as unknown[]).includes(row[field]) : row[field] === value)).slice(0, limit);
    return {
      path: `query:${name}:${JSON.stringify(filters)}:${limit}`,
      read: () => entries(),
      get: async () => { const docs = entries().map(([path]) => snapshot(path)); return { docs, empty: docs.length === 0, size: docs.length }; },
      where: (field: string, operator: string, value: unknown) => { if (!['==', 'in'].includes(operator)) throw new Error('Unexpected query'); return query(name, [...filters, [field, operator, value]], limit); },
      limit: (value: number) => query(name, filters, value),
    };
  };
  return {
    requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw new Error('Sign in required'); return request.auth.uid; },
    rateLimit: async () => true, enforceRateLimit: () => {},
    db: {
      doc: ref,
      collection: (name: string) => ({ ...query(name), doc: (id = `generated-${++state.next}`) => ref(`${name}/${id}`) }),
      runTransaction: async (callback: (tx: unknown) => unknown) => {
        for (let attempt = 0; attempt < 6; attempt++) {
          const reads: Array<{ target: { read: () => unknown }; value: string | undefined }> = [];
          const writes: Array<{ ref: ReturnType<typeof ref>; value: Row; create: boolean; mode?: 'set' | 'delete'; merge?: boolean }> = [];
          const result = await callback({
            get: async (target: { path: string; read: () => unknown; get: () => Promise<unknown> }) => {
              if (writes.length) throw new Error('Transaction reads after writes');
              const value = JSON.stringify(target.read());
              const result = await target.get();
              reads.push({ target, value }); state.afterRead?.(target.path); return result;
            },
            set: (target: ReturnType<typeof ref>, value: Row, options?: { merge?: boolean }) => writes.push({ ref: target, value, create: false, mode: 'set', merge: options?.merge }),
            delete: (target: ReturnType<typeof ref>) => writes.push({ ref: target, value: {}, create: false, mode: 'delete' }),
            create: (target: ReturnType<typeof ref>, value: Row) => writes.push({ ref: target, value, create: true }),
            update: (target: ReturnType<typeof ref>, value: Row) => writes.push({ ref: target, value, create: false }),
          });
          if (reads.some(read => JSON.stringify(read.target.read()) !== read.value)) continue;
          for (const write of writes) {
            if (write.create && state.rows.has(write.ref.path)) throw new Error('Already exists');
            if (!write.create && !write.mode && !state.rows.has(write.ref.path)) throw new Error('Not found');
          }
          if (state.failWrite && writes.some(write => write.ref.path.startsWith(state.failWrite))) throw new Error('Mock atomic commit rejected');
          for (const write of writes) {
            if (write.mode === 'delete') { state.rows.delete(write.ref.path); state.writes.push(write.ref.path); continue; }
            state.rows.set(write.ref.path, structuredClone(write.create || (write.mode === 'set' && !write.merge) ? write.value : { ...state.rows.get(write.ref.path), ...write.value }));
            state.writes.push(write.ref.path);
          }
          return result;
        }
        throw new Error('Transaction contention');
      },
    },
  };
});
import { communityCreate, communityJoin, communityInvite, communityManage, communitySendMessage } from '../../functions/src/community';
const request = (uid: string, data: Row) => ({ auth: { uid, token: {} }, data, rawRequest: {} });
const create = (data: Row = {}, uid = 'auth-a') => communityCreate.run(request(uid, { name: 'Test community', isPublic: false, requestId: `request-${++state.next}-abcdefghijklmnop`, ...data }) as Parameters<typeof communityCreate.run>[0]);
const join = (data: Row, uid = 'auth-b') => communityJoin.run(request(uid, data) as Parameters<typeof communityJoin.run>[0]);
const manage = (action: string, data: Row = {}, uid = 'auth-a') => communityManage.run(request(uid, { action, ...data }) as Parameters<typeof communityManage.run>[0]);
const invite = (serverId: string, uid = 'auth-a') => communityInvite.run(request(uid, { action: 'regenerate', serverId }) as Parameters<typeof communityInvite.run>[0]);
const send = (channelId: string, data: Row = {}, uid = 'auth-b') => communitySendMessage.run(request(uid, { channelId, content: 'Hello', ...data }) as Parameters<typeof communitySendMessage.run>[0]);
const grantPath = (uid: string, serverId: string) => `community_admissions/${uid}/grants/${serverId}`;
const channels = (serverId: string) => [...state.rows.values()].filter(row => row.server_id === serverId && row.room_type);
beforeEach(() => {
  state.rows.clear(); state.writes = []; state.next = 0; state.afterRead = null; state.failWrite = '';
  for (const suffix of ['a', 'b', 'c']) {
    state.rows.set(`profiles/profile-${suffix}`, { user_id: `auth-${suffix}`, username: `Person ${suffix}` });
    state.rows.set(`user_auth_index/auth-${suffix}`, { profile_id: `profile-${suffix}` });
  }
  vi.stubEnv('GCLOUD_PROJECT', 'demo-community');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('trusted community admission', () => {
  it('replays creation concurrently without duplicating rooms or spending another quota slot', async () => {
    const data = { requestId: 'creation-request-stable' };
    const results = await Promise.all([create(data), create(data)]);
    expect(results[0].server.id).toBe(results[1].server.id);
    expect(channels(results[0].server.id)).toHaveLength(5);
    expect(state.rows.get('_community_create_limits/auth-a')?.count).toBe(1);
    await expect(create({ ...data, name: 'Different intent' })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('permits a known creation receipt after reaching the daily creation limit', async () => {
    const requestId = 'creation-request-repeat';
    const first = await create({ requestId });
    for (let index = 0; index < 4; index++) await create();
    await expect(create()).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(create({ requestId })).resolves.toMatchObject({ server: { id: first.server.id } });
  });
  it('atomically creates owner admission, roster, five rooms and a strong expiring invite', async () => {
    const { server } = await create();
    expect(server.invite_code).toMatch(/^vyc_[A-Za-z0-9_-]{32}$/);
    expect(Date.parse(server.invite_expires_at) - Date.now()).toBeGreaterThan(6.99 * 86400_000);
    expect(state.rows.get(grantPath('auth-a', server.id))).toMatchObject({ role: 'owner', user_id: 'profile-a', auth_uid: 'auth-a' });
    expect(channels(server.id)).toHaveLength(5);
    expect(server).toMatchObject({ owner_id: 'profile-a', member_count: 1 });
    expect([...state.rows.keys()].filter(path => path.startsWith('community_invites/'))).toHaveLength(1);
  });
  it('leaves no partial community when a room write fails', async () => {
    state.failWrite = 'channels/';
    await expect(create()).rejects.toThrow('atomic commit rejected');
    expect(state.writes).toEqual([]);
  });
  it('rejects a mismatched auth index before creating anything', async () => {
    state.rows.set('user_auth_index/auth-a', { profile_id: 'profile-b' });
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.writes).toEqual([]);
  });
  it('joins public communities by ID with member role and counts concurrent retries once', async () => {
    const { server } = await create({ isPublic: true });
    const results = await Promise.all([join({ serverId: server.id, role: 'owner' }), join({ serverId: server.id })]);
    expect(results.filter(result => result.alreadyMember)).toHaveLength(1);
    expect(state.rows.get(grantPath('auth-b', server.id))).toMatchObject({ role: 'member' });
    expect(state.rows.get(`servers/${server.id}`)?.member_count).toBe(2);
  });
  it('private server ID alone and legacy role rows cannot confer membership', async () => {
    const { server } = await create();
    state.rows.set(`server_members/${server.id}_profile-b`, { server_id: server.id, user_id: 'profile-b', role: 'owner' });
    const before = state.writes.length;
    await expect(join({ serverId: server.id })).rejects.toMatchObject({ code: 'not-found' });
    await expect(manage('listChannels', { serverId: server.id }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toHaveLength(before);
  });
  it('redeems a private invitation without exposing the private server to a client query', async () => {
    const { server } = await create();
    await expect(join({ inviteCode: server.invite_code })).resolves.toMatchObject({ server: { id: server.id }, alreadyMember: false });
    await expect(join({ inviteCode: server.invite_code })).resolves.toMatchObject({ alreadyMember: true });
    expect(state.rows.get(`community_invites/${server.invite_hash}`)?.uses).toBe(1);
  });
  it.each(['expired', 'exhausted', 'removed', 'wrong'])('denies %s invitations without membership writes', async kind => {
    const { server } = await create();
    const ref = `community_invites/${server.invite_hash}`;
    if (kind === 'expired') state.rows.get(ref)!.expires_at = '2000-01-01T00:00:00Z';
    if (kind === 'exhausted') state.rows.get(ref)!.uses = 1000;
    if (kind === 'removed') state.rows.delete(ref);
    const before = state.writes.length;
    await expect(join({ inviteCode: kind === 'wrong' ? `vyc_${'a'.repeat(32)}` : server.invite_code })).rejects.toHaveProperty('code');
    expect(state.writes).toHaveLength(before);
  });
  it('regeneration and public-to-private visibility change revoke the old invitation', async () => {
    const { server } = await create({ isPublic: true });
    const rotated = await invite(server.id);
    await expect(join({ inviteCode: server.invite_code })).rejects.toMatchObject({ code: 'not-found' });
    await manage('updateServer', { serverId: server.id, isPublic: false });
    await expect(join({ inviteCode: rotated.inviteCode })).rejects.toMatchObject({ code: 'not-found' });
    await expect(join({ serverId: server.id })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('rechecks invitation revocation during redemption', async () => {
    const { server } = await create();
    state.afterRead = path => { if (path === `community_invites/${server.invite_hash}`) { state.afterRead = null; state.rows.delete(path); } };
    const before = state.writes.length;
    await expect(join({ inviteCode: server.invite_code })).rejects.toMatchObject({ code: 'not-found' });
    expect(state.writes).toHaveLength(before);
  });
  it('recovers only a proven legacy owner and does not elevate legacy administrators', async () => {
    state.rows.set('servers/legacy', { owner_id: 'profile-a', is_public: false, member_count: 500, invite_code: 'OLDWEAK' });
    state.rows.set('server_members/legacy_profile-b', { server_id: 'legacy', user_id: 'profile-b', role: 'admin' });
    await expect(manage('recoverOwner', { serverId: 'legacy' }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(manage('recoverOwner', { serverId: 'legacy' })).resolves.toMatchObject({ server: { member_count: 1, authority_version: 2 } });
    expect(state.rows.has(grantPath('auth-b', 'legacy'))).toBe(false);
    expect(channels('legacy')).toHaveLength(5);
    const mine = await manage('listMine');
    expect(mine).toMatchObject({ servers: [expect.objectContaining({ id: 'legacy', myRole: 'owner' })] });
  });
});

describe('community roles and channel boundaries', () => {
  it.each([null, 'true', 1])('fails closed for malformed explicit channel visibility %j', async canView => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = String(channels(server.id)[0].id);
    state.rows.set(`channel_permissions/${channel}_member`, { channel_id: channel, role: 'member', can_view: canView });
    await expect(manage('permissions', { channelId: channel }, 'auth-b')).resolves.toMatchObject({ permissions: { can_view: false, can_send: false } });
    await expect(send(channel)).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('shows effective moderator announcement defaults and refuses edits to fixed manager capabilities', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channelId = String(channels(server.id).find(row => row.type === 'announcement')!.id);
    const response = await manage('listPermissions', { channelId }) as { permissions: Row[] };
    expect(response.permissions.find(row => row.role === 'moderator')).toMatchObject({ can_send: true, can_manage: false });
    await manage('setRole', { serverId: server.id, userId: 'profile-b', role: 'moderator' });
    await expect(manage('permissions', { channelId }, 'auth-b')).resolves.toMatchObject({ permissions: { can_send: true } });
    await expect(manage('setPermission', { serverId: server.id, channelId, role: 'member', field: 'can_manage', value: true })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(manage('setPermission', { serverId: server.id, channelId, role: 'admin', field: 'can_view', value: false })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('only the owner grants roles; server-owned admissions drive capabilities', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id }); await join({ serverId: server.id }, 'auth-c');
    await expect(manage('setRole', { serverId: server.id, userId: 'profile-b', role: 'admin' }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    await manage('setRole', { serverId: server.id, userId: 'profile-b', role: 'admin' });
    await expect(invite(server.id, 'auth-b')).resolves.toHaveProperty('inviteCode');
    await expect(manage('setRole', { serverId: server.id, userId: 'profile-c', role: 'admin' }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(manage('removeMember', { serverId: server.id, userId: 'profile-a' }, 'auth-b')).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('requires ownership transfer before leaving and removes old owner authority', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    await expect(manage('leave', { serverId: server.id })).rejects.toMatchObject({ code: 'failed-precondition' });
    await manage('transferOwnership', { serverId: server.id, userId: 'profile-b' });
    await expect(invite(server.id)).rejects.toMatchObject({ code: 'permission-denied' });
    await manage('leave', { serverId: server.id });
    expect(state.rows.get(`servers/${server.id}`)?.owner_id).toBe('profile-b');
    expect(state.rows.has(grantPath('auth-a', server.id))).toBe(false);
    await expect(invite(server.id, 'auth-b')).resolves.toHaveProperty('inviteCode');
  });
  it('removal revokes admission and roster together', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    await manage('removeMember', { serverId: server.id, userId: 'auth-b' });
    await expect(manage('listChannels', { serverId: server.id }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.rows.has(`community_rosters/${server.id}/members/auth-b`)).toBe(false);
    expect(state.rows.get(`servers/${server.id}`)?.member_count).toBe(1);
  });
  it('private channels require explicit visibility; listings filter them', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const result = await manage('createChannel', { serverId: server.id, name: 'Private', type: 'voice', isPrivate: true });
    const channel = (result as { channel: Row }).channel;
    expect((await manage('listChannels', { serverId: server.id }, 'auth-b') as { channels: Row[] }).channels.some(row => row.id === channel.id)).toBe(false);
    await expect(manage('permissions', { channelId: channel.id }, 'auth-b')).resolves.toMatchObject({ permissions: { can_view: false, can_send: false } });
    await manage('setPermission', { serverId: server.id, channelId: channel.id, role: 'member', field: 'can_view', value: true });
    await expect(manage('permissions', { channelId: channel.id }, 'auth-b')).resolves.toMatchObject({ permissions: { can_view: true } });
  });
  it('does not permit channel mutation through a different managed server', async () => {
    const first = await create(); const second = await create({}, 'auth-b');
    const target = channels(second.server.id)[0]; const before = state.writes.length;
    await expect(manage('deleteChannel', { serverId: first.server.id, channelId: target.id })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toHaveLength(before);
  });
  it('server archival preserves the owner anchor and closes access and old invitations', async () => {
    const { server } = await create(); await join({ inviteCode: server.invite_code });
    await manage('deleteServer', { serverId: server.id });
    expect(state.rows.get(`servers/${server.id}`)?.owner_id).toBe('profile-a');
    await expect(join({ inviteCode: server.invite_code }, 'auth-c')).rejects.toMatchObject({ code: 'not-found' });
    await expect(manage('listChannels', { serverId: server.id }, 'auth-b')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('community messages bind sender and current permissions', () => {
  it('rejects poisoned pre-existing retry IDs even if the legacy row mimics the sender tuple', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = String(channels(server.id)[0].id); const key = createHash('sha256').update(JSON.stringify([channel, 'auth-b', 'poison'])).digest('hex');
    state.rows.set(`channel_messages/${key}`, { channel_id: channel, server_id: server.id, author_id: 'auth-b', sender_id: 'profile-b', content: 'Hello', media_url: null, media_type: null, reply_to_id: null });
    await expect(send(channel, { clientMessageId: 'poison' })).rejects.toMatchObject({ code: 'already-exists' });
    expect(state.rows.has(`community_message_receipts/${key}`)).toBe(false);
  });
  it('conflicts when an idempotency key is reused with another payload', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = String(channels(server.id)[0].id); await send(channel, { clientMessageId: 'same' });
    await expect(send(channel, { clientMessageId: 'same', content: 'Different' })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('validates replies against the same channel and rejects missing/deleted replies', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = String(channels(server.id)[0].id); const other = String(channels(server.id)[2].id);
    const original = await send(channel);
    await expect(send(channel, { replyToId: original.message.id })).resolves.toMatchObject({ message: { reply_to_id: original.message.id } });
    await expect(send(other, { replyToId: original.message.id })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(send(channel, { replyToId: 'missing' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await manage('deleteMessage', { channelId: channel, messageId: original.message.id }, 'auth-b');
    await expect(send(channel, { replyToId: original.message.id })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('checks current author and channel authority for message edits, moderation and pins', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id }); await join({ serverId: server.id }, 'auth-c');
    const channel = String(channels(server.id)[0].id); const { message } = await send(channel);
    const args = { channelId: channel, messageId: message.id };
    await expect(manage('editMessage', { ...args, content: 'forged' }, 'auth-c')).rejects.toMatchObject({ code: 'permission-denied' });
    await manage('editMessage', { ...args, content: 'Edited' }, 'auth-b');
    expect(state.rows.get(`channel_messages/${message.id}`)).toMatchObject({ content: 'Edited', is_edited: true, sender_id: 'profile-b', author_id: 'auth-b' });
    await expect(manage('pinMessage', { ...args, pinned: true }, 'auth-b')).rejects.toMatchObject({ code: 'permission-denied' });
    await manage('pinMessage', { ...args, pinned: true });
    await expect(manage('deleteMessage', args, 'auth-c')).rejects.toMatchObject({ code: 'permission-denied' });
    await manage('deleteMessage', args);
    expect(state.rows.get(`channel_messages/${message.id}`)).toMatchObject({ content: null, is_deleted: true, media_url: null });
  });
  it('ignores forged sender fields and deduplicates concurrent retries', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = channels(server.id).find(row => row.room_type === 'chat')!;
    const messages = await Promise.all([send(String(channel.id), { clientMessageId: 'same', sender_id: 'profile-c', author_id: 'auth-c' }), send(String(channel.id), { clientMessageId: 'same' })]);
    expect(messages[0].message).toMatchObject({ sender_id: 'profile-b', author_id: 'auth-b' });
    expect(messages[0].message.id).toBe(messages[1].message.id);
    expect([...state.rows.keys()].filter(path => path.startsWith('channel_messages/'))).toHaveLength(1);
  });
  it('does not leak a prior message through retry after removal', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const channel = String(channels(server.id)[0].id); await send(channel, { clientMessageId: 'retry' });
    await manage('removeMember', { serverId: server.id, userId: 'profile-b' });
    await expect(send(channel, { clientMessageId: 'retry' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('enforces announcement and explicit send restrictions', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const announcement = String(channels(server.id).find(row => row.type === 'announcement')!.id);
    await expect(send(announcement)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(send(announcement, {}, 'auth-a')).resolves.toHaveProperty('message');
    const channel = String(channels(server.id)[0].id);
    await manage('setPermission', { serverId: server.id, channelId: channel, role: 'member', field: 'can_send', value: false });
    await expect(send(channel)).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('rechecks membership revocation racing a message write', async () => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    const path = grantPath('auth-b', server.id);
    state.afterRead = key => { if (key === path) { state.afterRead = null; state.rows.delete(key); } };
    await expect(send(String(channels(server.id)[0].id))).rejects.toMatchObject({ code: 'permission-denied' });
    expect([...state.rows.keys()].some(key => key.startsWith('channel_messages/'))).toBe(false);
  });
  it.each([
    'https://evil.invalid/file', 'gs://other-project.appspot.com/media/auth-b/file.png',
    'gs://demo-community.appspot.com/media/auth-c/auth-b/file.png', 'javascript:alert(1)',
    'https://firebasestorage.googleapis.com/v0/b/demo-community.appspot.com/o/media%2Fauth-c%2Ffile.png?token=fixture',
  ])('rejects foreign or unowned media %s', async mediaUrl => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    await expect(send(String(channels(server.id)[0].id), { mediaUrl })).rejects.toHaveProperty('code');
  });
  it.each([
    'gs://demo-community.appspot.com/media/auth-b/file.png',
    'https://firebasestorage.googleapis.com/v0/b/demo-community.appspot.com/o/community-assets%2Fauth-b%2Ffile.png?token=fixture',
  ])('accepts this account Storage namespace %s', async mediaUrl => {
    const { server } = await create({ isPublic: true }); await join({ serverId: server.id });
    await expect(send(String(channels(server.id)[0].id), { mediaUrl, mediaType: 'image' })).resolves.toMatchObject({ message: { media_url: mediaUrl } });
  });
});
