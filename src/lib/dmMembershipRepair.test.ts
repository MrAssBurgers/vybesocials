import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uid: 'alice-auth' as string | null,
  records: new Map<string, Record<string, unknown>>(),
  profiles: new Map<string, string>(),
  setDocument: vi.fn(),
  updateDoc: vi.fn(),
  getDocuments: vi.fn(),
  getDocument: vi.fn(),
  getDocumentFromServer: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  arrayUnion: (...values: string[]) => ({ arrayUnion: values }),
  updateDoc: state.updateDoc,
}));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  getDocument: state.getDocument,
  getDocumentFromServer: state.getDocumentFromServer,
  getDocuments: state.getDocuments,
  setDocument: state.setDocument,
  documentRef: (collection: string, id: string) => `${collection}/${id}`,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  firestoreLimit: (count: number) => ({ count }),
}));
vi.mock('@/lib/firebase/authService', () => ({
  firebaseAuth: { getUser: async () => ({ data: { user: state.uid ? { id: state.uid } : null } }) },
}));
vi.mock('@/lib/firebase/users', () => ({
  resolveProfileIdFromAuthUid: async (uid: string) => state.profiles.get(uid) || uid,
  getUserProfile: async (id: string) => {
    const entry = [...state.profiles].find(([uid, profile]) => uid === id || profile === id);
    return entry ? { id: entry[1], user_id: entry[0] } : null;
  },
}));
vi.mock('@/lib/firebase/profileResolve', () => ({ syncUserAuthIndex: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.uid = 'alice-auth';
  state.records.clear();
  state.profiles = new Map([['alice-auth', 'alice-profile'], ['bob-auth', 'bob-profile']]);
  const read = async (collection: string, id: string) => state.records.get(`${collection}/${id}`) || null;
  state.getDocument.mockImplementation(read);
  state.getDocumentFromServer.mockImplementation(read);
  state.setDocument.mockImplementation(async (collection: string, id: string, data: Record<string, unknown>) => {
    state.records.set(`${collection}/${id}`, { ...(state.records.get(`${collection}/${id}`) || {}), ...data });
  });
  state.getDocuments.mockImplementation(async (collection: string, constraints: Array<{ field?: string; value?: unknown }>) => {
    return [...state.records.entries()].filter(([key, value]) => key.startsWith(`${collection}/`) && constraints.every(filter => !filter.field || value[filter.field] === filter.value)).map(([key, value]) => ({ id: key.split('/')[1], ...value }));
  });
  state.updateDoc.mockImplementation(async (key: string, changes: { member_ids: { arrayUnion: string[] } }) => {
    const existing = state.records.get(key);
    if (!existing) throw new Error('Parent missing');
    state.records.set(key, { ...existing, member_ids: [...new Set([...(existing.member_ids as string[] || []), ...changes.member_ids.arrayUnion])] });
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('DM membership authority repair', () => {
  it('atomically unions only own aliases without dropping group participants', async () => {
    const { mergeConversationMemberIds } = await import('./dmMembershipRepair');
    state.records.set('conversations/group', { member_ids: ['alice-profile', 'bob-profile', 'carol-profile'] });
    await mergeConversationMemberIds('group', ['alice-profile', 'alice-auth', 'bob-profile', 'bob-auth']);
    expect(state.updateDoc).toHaveBeenCalledWith('conversations/group', { member_ids: { arrayUnion: ['alice-profile', 'alice-auth'] } });
    expect(state.records.get('conversations/group')?.member_ids).toEqual(['alice-profile', 'bob-profile', 'carol-profile', 'alice-auth']);
    expect(state.setDocument).not.toHaveBeenCalled();
  });

  it('does not create a missing parent through alias merge', async () => {
    const { mergeConversationMemberIds } = await import('./dmMembershipRepair');
    await mergeConversationMemberIds('deleted-group', ['alice-profile', 'alice-auth']);
    expect(state.records.has('conversations/deleted-group')).toBe(false);
    expect(state.setDocument).not.toHaveBeenCalled();
  });

  it('does not restore random or group parents as a historical member', async () => {
    const { ensureConversationDocument } = await import('./dmMembershipRepair');
    state.records.set('conversation_members/legacy-row', { conversation_id: 'deleted-group', user_id: 'alice-profile', role: 'member' });
    await ensureConversationDocument('deleted-group', 'alice-profile', 'bob-profile');
    expect(state.setDocument).not.toHaveBeenCalled();
  });

  it('restores an owned deterministic profile pair including both auth aliases', async () => {
    const { ensureConversationDocument } = await import('./dmMembershipRepair');
    await ensureConversationDocument('alice-profile_bob-profile', 'alice-profile', 'bob-profile');
    expect(state.setDocument).toHaveBeenCalledWith('conversations', 'alice-profile_bob-profile', expect.objectContaining({
      created_by: 'alice-profile', is_group: false,
      member_ids: ['alice-profile', 'bob-profile', 'alice-auth', 'bob-auth'],
    }));
  });

  it('rejects a mismatched peer hint and a deterministic pair owned by other accounts', async () => {
    const { ensureConversationDocument } = await import('./dmMembershipRepair');
    await ensureConversationDocument('alice-profile_bob-profile', 'alice-profile', 'carol-profile');
    await ensureConversationDocument('bob-profile_carol-profile', 'alice-profile');
    await ensureConversationDocument('alice-profile_bob-profile', 'bob-profile');
    expect(state.setDocument).not.toHaveBeenCalled();
  });

  it('uses the same owned random-ID legacy proof for both profile and UID aliases', async () => {
    const { ensureFlatConversationMembership } = await import('./dmMembershipRepair');
    state.records.set('conversation_members/imported-row', { conversation_id: 'legacy-chat', user_id: 'alice-profile', role: 'admin', is_muted: true });
    await ensureFlatConversationMembership('legacy-chat', 'alice-profile');
    expect(state.setDocument).toHaveBeenCalledTimes(2);
    for (const identity of ['alice-profile', 'alice-auth']) {
      expect(state.records.get(`conversation_members/legacy-chat_${identity}`)).toMatchObject({
        user_id: identity, conversation_id: 'legacy-chat', role: 'admin', legacy_membership_id: 'imported-row', is_muted: true,
      });
    }
  });

  it('continues own legacy proof repair when the initial composite read is denied', async () => {
    const { ensureFlatConversationMembership } = await import('./dmMembershipRepair');
    state.records.set('conversation_members/imported-row', { conversation_id: 'legacy-denied', user_id: 'alice-profile', role: 'member' });
    state.getDocument.mockRejectedValue(new Error('permission-denied'));
    await ensureFlatConversationMembership('legacy-denied', 'alice-profile');
    expect(state.records.get('conversation_members/legacy-denied_alice-auth')?.legacy_membership_id).toBe('imported-row');
  });

  it('does not copy another account legacy role or claim its row as an ownership proof', async () => {
    const { ensureFlatConversationMembership } = await import('./dmMembershipRepair');
    state.records.set('conversation_members/bob-imported', { conversation_id: 'peer-chat', user_id: 'bob-profile', role: 'admin' });
    await ensureFlatConversationMembership('peer-chat', 'bob-profile', 'bob-auth');
    expect(state.records.get('conversation_members/peer-chat_bob-profile')).toMatchObject({ role: 'member' });
    expect(state.records.get('conversation_members/peer-chat_bob-profile')).not.toHaveProperty('legacy_membership_id');
  });

  it('does not mark malformed composites as ready merely because their paths exist', async () => {
    const { prepareConversationForMessages, isConversationMessagesReady } = await import('./dmMembershipRepair');
    state.records.set('conversation_members/malformed-chat_alice-profile', { conversation_id: 'other-chat', user_id: 'alice-profile' });
    state.records.set('conversation_members/malformed-chat_alice-auth', { conversation_id: 'malformed-chat', user_id: 'bob-auth' });
    state.setDocument.mockRejectedValue(new Error('immutable membership identity'));
    await prepareConversationForMessages('malformed-chat', 'alice-profile', null, { fast: true });
    expect(isConversationMessagesReady('malformed-chat', 'alice-profile')).toBe(false);
  });

  it('does not attempt account alias repair after sign-out', async () => {
    const { mergeConversationMemberIds, ensureConversationDocument } = await import('./dmMembershipRepair');
    state.uid = null;
    await mergeConversationMemberIds('old-chat', ['alice-auth', 'alice-profile']);
    await ensureConversationDocument('alice-profile_bob-profile', 'alice-profile');
    expect(state.updateDoc).not.toHaveBeenCalled();
    expect(state.setDocument).not.toHaveBeenCalled();
  });
});
