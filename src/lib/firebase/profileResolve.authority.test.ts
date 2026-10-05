import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, doc: vi.fn(), rows: vi.fn(), provision: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => mock.session }));
vi.mock('@/lib/accountProfileService', () => ({ provisionAccountProfile: (...args: unknown[]) => mock.provision(...args) }));
vi.mock('./firestoreDb', () => ({ getDocument: mock.doc, getDocumentFromServer: mock.doc, getDocuments: mock.rows, getDocumentsFromServer: mock.rows, setDocument: mock.write, where: (...args: unknown[]) => args, firestoreLimit: (n: number) => ['limit', n] }));
import { getProfileByAuthUid, syncUserAuthIndex } from './profileResolve';
const profile = { id: 'legacy-alice', user_id: 'alice', username: 'alice' };
beforeEach(() => { vi.clearAllMocks(); mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.doc.mockImplementation(async (table: string) => table === 'user_auth_index' ? { profile_id: profile.id } : null); mock.rows.mockResolvedValue([profile]); mock.provision.mockResolvedValue({ profileId: profile.id }); });
describe('read-only canonical profile lookup', () => {
  it('accepts a unique owned legacy profile and never repairs through raw writes', async () => {
    expect(await getProfileByAuthUid('alice')).toEqual(profile);
    expect(mock.rows).toHaveBeenCalledWith('profiles', [['user_id', '==', 'alice'], ['limit', 2]]);
    expect(mock.write).not.toHaveBeenCalled(); expect(mock.provision).not.toHaveBeenCalled();
  });
  it.each(['foreign-index', 'duplicate', 'direct-collision', 'foreign-owner', 'foreign-index-owner'])('refuses %s instead of choosing an account', async kind => {
    if (kind === 'foreign-index') mock.doc.mockResolvedValueOnce({ profile_id: 'victim' });
    if (kind === 'foreign-index-owner') mock.doc.mockResolvedValueOnce({ profile_id: profile.id, owner_uid: 'bob' });
    if (kind === 'duplicate') mock.rows.mockResolvedValue([profile, { ...profile, id: 'second' }]);
    if (kind === 'foreign-owner') mock.rows.mockResolvedValue([{ ...profile, user_id: 'bob' }]);
    if (kind === 'direct-collision') mock.doc.mockImplementation(async (table: string) => table === 'user_auth_index' ? null : { id: 'alice', user_id: 'bob' });
    await expect(getProfileByAuthUid('alice')).rejects.toMatchObject({ details: { reason: 'profile-recovery-required' } });
    expect(mock.write).not.toHaveBeenCalled();
  });
  it('resolves another public UID without reading its private auth index', async () => {
    mock.rows.mockResolvedValue([{ id: 'legacy-bob', user_id: 'bob' }]); mock.doc.mockResolvedValue(null);
    expect((await getProfileByAuthUid('bob'))?.id).toBe('legacy-bob');
    expect(mock.doc).not.toHaveBeenCalledWith('user_auth_index', 'bob');
  });
  it('retires an index response before further reads after account ABA', async () => {
    let resolve!: (row: unknown) => void; mock.doc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const pending = getProfileByAuthUid('alice'); mock.session = { uid: 'alice', epoch: mock.session.epoch + 2 }; resolve({ profile_id: profile.id });
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(mock.rows).not.toHaveBeenCalled();
  });
  it('syncs only through the checked server action with the supplied profile binding', async () => {
    await syncUserAuthIndex('alice', profile.id);
    expect(mock.provision).toHaveBeenCalledWith('alice', { action: 'syncIndex', expectedProfileId: profile.id }, expect.any(Function));
    expect(mock.write).not.toHaveBeenCalled();
    await expect(syncUserAuthIndex('bob', 'legacy-bob')).rejects.toMatchObject({ code: 'account-changed' }); expect(mock.provision).toHaveBeenCalledTimes(1);
  });
});
