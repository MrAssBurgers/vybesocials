// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>(), writes: [] as string[], next: 0, mints: 0,
  grants: [] as Row[], afterRead: null as ((key: string) => void) | null }));
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
  const query = (name: string, filters: Array<[string, unknown]> = [], limit = Infinity) => {
    const entries = () => [...state.rows.entries()].filter(([path, row]) => path.startsWith(`${name}/`)
      && path.split('/').length === name.split('/').length + 1 && filters.every(([field, value]) => row[field] === value)).slice(0, limit);
    return {
      path: `query:${name}:${JSON.stringify(filters)}:${limit}`,
      read: () => entries(),
      get: async () => { const docs = entries().map(([path]) => snapshot(path)); return { docs, empty: docs.length === 0 }; },
      where: (field: string, operator: string, value: unknown) => { if (operator !== '==') throw new Error('Unexpected query'); return query(name, [...filters, [field, value]], limit); },
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
          const writes: Array<{ ref: ReturnType<typeof ref>; value: Row; create: boolean }> = [];
          const result = await callback({
            get: async (target: { path: string; read: () => unknown; get: () => Promise<unknown> }) => {
              if (writes.length) throw new Error('Transaction reads after writes');
              const value = JSON.stringify(target.read());
              const result = await target.get();
              reads.push({ target, value }); state.afterRead?.(target.path); return result;
            },
            create: (target: ReturnType<typeof ref>, value: Row) => writes.push({ ref: target, value, create: true }),
            update: (target: ReturnType<typeof ref>, value: Row) => writes.push({ ref: target, value, create: false }),
          });
          if (reads.some(read => JSON.stringify(read.target.read()) !== read.value)) continue;
          for (const write of writes) {
            if (write.create && state.rows.has(write.ref.path)) throw new Error('Already exists');
            if (!write.create && !state.rows.has(write.ref.path)) throw new Error('Not found');
          }
          for (const write of writes) {
            state.rows.set(write.ref.path, structuredClone(write.create ? write.value : { ...state.rows.get(write.ref.path), ...write.value }));
            state.writes.push(write.ref.path);
          }
          return result;
        }
        throw new Error('Transaction contention');
      },
    },
  };
});
vi.mock('../../functions/src/relationshipEngine.js', () => ({ mapDmSendToRelationshipEvent: () => null, recordRelationshipActivity: vi.fn() }));
vi.mock('../../functions/node_modules/livekit-server-sdk/dist/index.js', () => ({
  AccessToken: class {
    constructor() { state.mints++; }
    addGrant(grant: Row) { state.grants.push(grant); }
    async toJwt() { return 'mock-room-token'; }
  },
}));
import { sendDmMessage } from '../../functions/src/dmSend';
import { startDmCall } from '../../functions/src/calls';
import { livekitToken, communityVoiceToken, spacesToken } from '../../functions/src/realtime';

const CID = 'profile-a_profile-b';
const GROUP = 'private-group';
const actor = { auth: { uid: 'auth-a', token: {} }, rawRequest: {} };
const send = (extra: Row = {}) => sendDmMessage.run({ ...actor, data: { conversationId: CID, content: 'Hello', ...extra } } as Parameters<typeof sendDmMessage.run>[0]);
const call = (extra: Row = {}) => startDmCall.run({ ...actor, data: { conversationId: CID, receiverId: 'profile-b', ...extra } } as Parameters<typeof startDmCall.run>[0]);
const room = (data: Row) => livekitToken.run({ ...actor, data } as Parameters<typeof livekitToken.run>[0]);
const community = (data: Row = {}) => communityVoiceToken.run({ ...actor, data: { serverId: 'server-one', channelId: 'voice-one', ...data } } as Parameters<typeof communityVoiceToken.run>[0]);
const communityRoom = (serverId = 'server-one', channelId = 'voice-one') => `comm_v2_${createHash('sha256').update(JSON.stringify([serverId, channelId])).digest('hex')}`;
function parent(members = ['profile-a', 'profile-b'], id = CID, isGroup = false) {
  state.rows.set(`conversations/${id}`, { id, member_ids: members, is_group: isGroup, created_by: 'profile-a' });
}
function member(identity: string, id = CID, extra = {}) {
  state.rows.set(`conversation_members/${id}_${identity}`, { user_id: identity, conversation_id: id, role: 'member', ...extra });
}
beforeEach(() => {
  state.rows.clear(); state.writes = []; state.next = 0; state.mints = 0; state.grants = []; state.afterRead = null;
  for (const suffix of ['a', 'b', 'c']) {
    state.rows.set(`profiles/profile-${suffix}`, { user_id: `auth-${suffix}`, username: `Person ${suffix}` });
    state.rows.set(`user_auth_index/auth-${suffix}`, { profile_id: `profile-${suffix}` });
  }
  parent();
  state.rows.set('channels/voice-one', { server_id: 'server-one', type: 'voice' });
  vi.stubEnv('LIVEKIT_API_KEY', 'mock-key'); vi.stubEnv('LIVEKIT_API_SECRET', 'mock-secret'); vi.stubEnv('LIVEKIT_URL', 'wss://example.invalid');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('private conversation authority', () => {
  it.each(['profile-a', 'auth-a'])('accepts canonical membership proven by stored tuple for %s', async identity => {
    parent(['profile-b']); member(identity);
    await expect(send()).resolves.toMatchObject({ deduped: false });
    expect(state.rows.get(`conversation_members/${CID}_${identity}`)?.role).toBe('member');
  });
  it.each([
    { user_id: 'profile-c', conversation_id: CID }, { user_id: 'profile-a', conversation_id: 'unrelated' }, {},
  ])('rejects poisoned canonical membership %j before any write or room token', async poisoned => {
    parent(['profile-b']); state.rows.set(`conversation_members/${CID}_profile-a`, poisoned);
    for (const operation of [send, call, () => room({ conversationId: CID })]) {
      await expect(operation()).rejects.toMatchObject({ code: 'permission-denied' });
      expect(state.writes).toEqual([]); expect(state.mints).toBe(0);
    }
  });
  it('checks both aliases instead of treating a poisoned profile key as valid auth membership', async () => {
    parent(['profile-b']); member('profile-a', CID, { user_id: 'profile-c' }); member('auth-a', CID, { conversation_id: 'another-chat' });
    await expect(send()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
  it.each([false, true])('accepts a valid nested membership with explicit scope=%s', async explicit => {
    parent(['profile-b']);
    state.rows.set(`conversations/${CID}/members/profile-a`, { user_id: 'profile-a', ...(explicit ? { conversation_id: CID } : {}) });
    await expect(send()).resolves.toMatchObject({ deduped: false });
  });
  it.each([{ user_id: 'profile-c' }, { user_id: 'profile-a', conversation_id: 'other' }])('rejects an invalid nested tuple %j', async value => {
    parent(['profile-b']); state.rows.set(`conversations/${CID}/members/profile-a`, value);
    await expect(room({ conversationId: CID })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0);
  });
  it('uses an existing legacy random-ID row only to recover the caller aliases', async () => {
    parent(['profile-b']);
    state.rows.set('conversation_members/legacy-random', { conversation_id: CID, user_id: 'profile-a', role: 'member' });
    await expect(send()).resolves.toMatchObject({ deduped: false });
    expect(state.rows.get(`conversation_members/${CID}_auth-a`)).toMatchObject({ user_id: 'auth-a', role: 'member' });
  });
  it('does not infer membership from a forged key when no parent exists', async () => {
    state.rows.delete(`conversations/${CID}`); member('profile-a');
    await expect(room({ conversationId: CID })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0);
  });
  it('keeps existing roles, mute, pin, read time, and creation metadata', async () => {
    const stored = { role: 'member', is_muted: true, is_pinned: true, last_read_at: 'earlier', created_at: 'original' };
    member('profile-a', CID, stored); member('profile-b', CID, { ...stored, role: 'admin' });
    await send();
    expect(state.rows.get(`conversation_members/${CID}_profile-a`)).toMatchObject(stored);
    expect(state.rows.get(`conversation_members/${CID}_profile-b`)).toMatchObject({ ...stored, role: 'admin' });
  });
  it.each(['message', 'call'])('rejects a membership revocation racing a %s transaction', async kind => {
    state.afterRead = path => {
      if (path !== `conversations/${CID}`) return;
      state.afterRead = null; state.rows.get(path)!.member_ids = ['profile-b'];
    };
    await expect(kind === 'message' ? send() : call()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
});

describe('recipient proof and deterministic recovery', () => {
  it.each(['message', 'call'])('does not inject an unrelated hinted recipient into an existing %s', async kind => {
    await expect(kind === 'message' ? send({ otherProfileId: 'profile-c' }) : call({ receiverId: 'profile-c' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
    expect(state.rows.has(`conversation_members/${CID}_profile-c`)).toBe(false);
  });
  it.each(['profile-b', 'auth-b'])('accepts the proven recipient alias %s', async id => {
    await expect(send({ otherProfileId: id })).resolves.toMatchObject({ deduped: false });
    await expect(call({ receiverId: id })).resolves.toMatchObject({ call: { receiver_id: 'profile-b', is_group_call: false } });
  });
  it('requires peer proof even when a deterministic ID names that peer', async () => {
    parent(['profile-a']);
    await expect(send({ otherProfileId: 'profile-b' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
    member('profile-b');
    await expect(send()).resolves.toMatchObject({ deduped: false });
  });
  it('does not use an unverified legacy row to add another person to a private chat', async () => {
    parent(['profile-a']); state.rows.set('conversation_members/legacy-peer', { conversation_id: CID, user_id: 'profile-c' });
    await expect(send({ otherProfileId: 'profile-c' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
  it('recovers a direct peer through its correctly scoped canonical row', async () => {
    parent(['profile-a'], 'legacy-direct'); member('auth-b', 'legacy-direct');
    await expect(send({ conversationId: 'legacy-direct' })).resolves.toMatchObject({ deduped: false });
    expect(state.rows.get('conversation_members/legacy-direct_profile-b')?.user_id).toBe('profile-b');
  });
  it('creates only a caller-owned sorted deterministic pair with an existing peer profile', async () => {
    state.rows.delete(`conversations/${CID}`);
    await expect(send()).resolves.toMatchObject({ deduped: false });
    expect(state.rows.get(`conversations/${CID}`)).toMatchObject({ member_ids: ['profile-a', 'auth-a', 'profile-b', 'auth-b'] });
    expect(state.rows.get(`conversation_members/${CID}_profile-a`)?.role).toBe('member');
  });
  it.each([
    ['random-private', 'profile-b'], ['profile-b_profile-c', 'profile-b'],
    ['profile-b_profile-a', 'profile-b'], [CID, 'profile-c'], ['profile-a_unknown', 'unknown'],
  ])('denies unsafe recovery of %s with hint %s', async (id, hint) => {
    state.rows.delete(`conversations/${CID}`);
    await expect(send({ conversationId: id, otherProfileId: hint })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
  it.each(['profile-a', 'auth-a'])('blocks a new pair before creating parent or member docs (%s)', async sender => {
    state.rows.delete(`conversations/${CID}`);
    state.rows.set('blocked_users/block', { blocker_id: 'auth-b', blocked_id: sender });
    await expect(send()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
  it('allows group messages without treating the first member as a direct recipient', async () => {
    parent(['profile-a', 'profile-b', 'profile-c'], GROUP, true);
    await expect(send({ conversationId: GROUP })).resolves.toMatchObject({ deduped: false });
    expect(state.rows.get(`conversations/${GROUP}`)?.member_ids).toEqual(['profile-a', 'profile-b', 'profile-c', 'auth-a']);
    expect(state.rows.has(`conversation_members/${GROUP}_profile-b`)).toBe(false);
  });
  it('group calls require an existing recipient and derive group status from the parent', async () => {
    parent(['profile-a', 'profile-b'], GROUP, true);
    await expect(call({ conversationId: GROUP, receiverId: 'profile-c' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
    await expect(call({ conversationId: GROUP, isGroupCall: false })).resolves.toMatchObject({ call: { is_group_call: true } });
    await expect(call({ isGroupCall: true })).resolves.toMatchObject({ call: { is_group_call: false } });
  });
  it('accepts the legacy createGroup schema with type group and UID members', async () => {
    state.rows.set(`conversations/${GROUP}`, { type: 'group', created_by: 'auth-a', member_ids: ['auth-a', 'auth-b', 'auth-c'] });
    await expect(send({ conversationId: GROUP })).resolves.toMatchObject({ deduped: false });
    await expect(call({ conversationId: GROUP })).resolves.toMatchObject({ call: { is_group_call: true, receiver_id: 'profile-b' } });
    await expect(room({ conversationId: GROUP })).resolves.toMatchObject({ room: `call-${GROUP}` });
  });
});

describe('message retry authorization', () => {
  it('does not return a prior message to a removed member via clientMessageId', async () => {
    parent(['profile-b']);
    state.rows.set('messages/prior', { conversation_id: CID, sender_id: 'profile-a', client_message_id: 'retry', content: 'private prior data' });
    await expect(send({ clientMessageId: 'retry' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.writes).toEqual([]);
  });
  it('deduplicates concurrent authorized retries in the same transaction', async () => {
    const results = await Promise.all([send({ clientMessageId: 'same' }), send({ clientMessageId: 'same' })]);
    expect(results.filter(result => result.deduped)).toHaveLength(1);
    expect([...state.rows.keys()].filter(path => path.startsWith('messages/'))).toHaveLength(1);
  });
});

describe('room tokens require verified authority before minting', () => {
  it('denies a caller-owned forged call that points at another private conversation', async () => {
    parent(['profile-b', 'profile-c']);
    state.rows.set('calls/forged', { caller_id: 'profile-a', receiver_id: 'profile-b', conversation_id: CID });
    await expect(room({ callId: 'forged' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0); expect(state.grants).toEqual([]); expect(state.writes).toEqual([]);
  });
  it('uses the proven underlying conversation for an authorized call', async () => {
    state.rows.set('calls/real', { caller_id: 'profile-b', receiver_id: 'profile-a', conversation_id: CID });
    await expect(room({ callId: 'real' })).resolves.toMatchObject({ room: `call-${CID}`, token: 'mock-room-token' });
    expect(state.grants).toEqual([expect.objectContaining({ room: `call-${CID}`, roomJoin: true })]);
    expect(state.writes).toEqual([]);
  });
  it('allows a verified group member even if absent from a legacy call participant list', async () => {
    parent(['profile-a', 'profile-b'], GROUP, true);
    state.rows.set('calls/group', { caller_id: 'profile-b', conversation_id: GROUP });
    await expect(room({ callId: 'group' })).resolves.toMatchObject({ room: `call-${GROUP}` });
  });
  it('keeps standalone calls scoped to their call ID and existing participants', async () => {
    state.rows.set('calls/standalone', { caller_id: 'profile-b', receiver_id: 'auth-a', conversation_id: null });
    await expect(room({ callId: 'standalone' })).resolves.toMatchObject({ room: 'standalone_standalone' });
    state.rows.set('calls/stranger', { caller_id: 'profile-b', receiver_id: 'profile-c' });
    const before = state.mints;
    await expect(room({ callId: 'stranger' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(before);
  });
  it.each([`call-${CID}`, 'comm_server-one_voice-one', communityRoom()])('isolates a crafted standalone call ID %s from private rooms', async callId => {
    parent(['profile-b', 'profile-c']);
    state.rows.set(`calls/${callId}`, { caller_id: 'profile-a' });
    await expect(room({ callId })).resolves.toMatchObject({ room: `standalone_${callId}` });
    expect(state.grants[0].room).not.toBe(callId);
  });
  it.each([
    ['profile-a', 'auth-b'], ['auth-b', 'auth-a'], ['profile-b', 'profile-a'], ['auth-a', 'profile-b'],
  ])('checks both identity aliases for blocks before minting (%s -> %s)', async (blocker, blocked) => {
    state.rows.set('blocked_users/block', { blocker_id: blocker, blocked_id: blocked });
    state.rows.set('calls/owned', { caller_id: 'profile-a', conversation_id: CID });
    await expect(room({ conversationId: CID })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(room({ callId: 'owned' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0); expect(state.writes).toEqual([]);
  });
  it('rechecks a racing block before minting a conversation token', async () => {
    state.afterRead = path => {
      if (!path.startsWith('query:blocked_users:')) return;
      state.afterRead = null;
      state.rows.set('blocked_users/block', { blocker_id: 'auth-b', blocked_id: 'auth-a' });
    };
    await expect(room({ conversationId: CID })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0);
  });
  it.each([
    { server_id: 'server-one', user_id: 'profile-c' },
    { server_id: 'other-server', user_id: 'profile-a' }, {},
  ])('does not mint community tokens for malformed membership %j', async row => {
    state.rows.set('server_members/server-one_profile-a', row);
    await expect(community()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0);
  });
  it.each(['profile-a', 'auth-a'])('accepts a correctly scoped server member %s', async id => {
    state.rows.set(`server_members/server-one_${id}`, { server_id: 'server-one', user_id: id });
    await expect(community()).resolves.toMatchObject({ room: communityRoom() });
  });
  it.each([undefined, { server_id: 'different', type: 'voice' }, { server_id: 'server-one', type: 'text' }])('rejects a missing, cross-server or nonvoice channel %j', async row => {
    state.rows.set('server_members/server-one_profile-a', { server_id: 'server-one', user_id: 'profile-a' });
    if (row) state.rows.set('channels/voice-one', row); else state.rows.delete('channels/voice-one');
    await expect(community()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0); expect(state.writes).toEqual([]);
  });
  it('keeps ambiguous underscore server/channel pairs in distinct rooms across both issuers', async () => {
    const cases = [['server_sub', 'voice'], ['server', 'sub_voice']];
    for (const [serverId, channelId] of cases) {
      state.rows.set(`server_members/${serverId}_profile-a`, { server_id: serverId, user_id: 'profile-a' });
      state.rows.set(`channels/${channelId}`, { server_id: serverId, type: 'voice' });
      const canonical = await community({ serverId, channelId });
      const alias = await spacesToken.run({ ...actor, data: { serverId, channelId } } as Parameters<typeof spacesToken.run>[0]);
      expect(canonical.room).toBe(communityRoom(serverId, channelId));
      expect(alias.room).toBe(canonical.room);
    }
    expect(state.grants[0].room).not.toBe(state.grants[2].room);
    expect(state.grants[0].room).not.toBe('comm_server_sub_voice');
  });
  it('rechecks a community membership revocation before token mint', async () => {
    state.rows.set('server_members/server-one_profile-a', { server_id: 'server-one', user_id: 'profile-a' });
    state.afterRead = path => {
      if (path !== 'server_members/server-one_profile-a') return;
      state.afterRead = null; state.rows.delete(path);
    };
    await expect(community()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.mints).toBe(0);
  });
  it.each([{ conversationId: '../other' }, { callId: { arbitrary: true } }, { conversationId: 'x'.repeat(201) }])('rejects invalid token targets %j without minting', async data => {
    await expect(room(data)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.mints).toBe(0);
  });
});
