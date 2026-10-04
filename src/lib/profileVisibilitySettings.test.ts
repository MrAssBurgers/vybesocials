import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, read: vi.fn(), get: vi.fn(), update: vi.fn(), set: vi.fn() }));
vi.mock('./firebase/firestoreDb', () => ({ documentRef: (table: string, id: string) => `${table}/${id}`, getDocumentFromServer: (...args: unknown[]) => state.read(...args), getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({ Timestamp: class {}, runTransaction: (_: unknown, callback: (tx: unknown) => Promise<unknown>) => callback({ get: state.get, update: state.update, set: state.set }) }));
import { parseVisibilitySettings, readVisibilitySettings, writeVisibilitySetting } from './profileVisibilitySettings';
import { PROFILE_VISIBILITY_DEFAULTS } from './profileVisibility';
beforeEach(() => { vi.clearAllMocks(); state.row = null; state.read.mockImplementation(async () => state.row); state.get.mockImplementation(async () => ({ exists: () => state.row !== null, data: () => state.row })); });
describe('visibility settings with fresh atomic edits', () => {
  it('uses explicit defaults only for a missing doc or missing field in a valid map', () => {
    expect(parseVisibilitySettings(null, 'p').fields).toEqual(PROFILE_VISIBILITY_DEFAULTS);
    expect(parseVisibilitySettings({ fields: { bio: 'close_friends' } }, 'p').fields).toEqual({ ...PROFILE_VISIBILITY_DEFAULTS, bio: 'close_friends' });
  });
  it.each([{}, { fields: null }, { fields: [] }, { fields: 'public' }])('marks malformed maps unavailable %#', value => {
    const parsed = parseVisibilitySettings(value, 'p'); expect(parsed.needsRepair).toBe(true); expect(Object.values(parsed.fields).every(value => value === 'unavailable')).toBe(true);
  });
  it('fails closed on conflicting document ownership', () => { expect(() => parseVisibilitySettings({ user_id: 'other', fields: {} }, 'p')).toThrow('verified'); });
  it('never substitutes defaults after a server read failure', async () => {
    state.read.mockRejectedValue(new Error('offline')); await expect(readVisibilitySettings('p', vi.fn())).rejects.toThrow('offline'); expect(state.set).not.toHaveBeenCalled();
  });
  it('edits the freshly read field map, preserving other-tab changes', async () => {
    const old = await readVisibilitySettings('p', vi.fn()); expect(old.fields.posts).toBe('public');
    state.row = { id: 'p', user_id: 'p', fields: { ...PROFILE_VISIBILITY_DEFAULTS, posts: 'only_me' } };
    await writeVisibilitySetting('p', { field: 'bio', level: 'close_friends' }, vi.fn());
    expect(state.update).toHaveBeenCalledWith('profile_visibility/p', expect.objectContaining({ fields: { ...PROFILE_VISIBILITY_DEFAULTS, posts: 'only_me', bio: 'close_friends' } }));
  });
  it('requires explicit repair and keeps every recognized setting', async () => {
    state.row = { fields: { ...PROFILE_VISIBILITY_DEFAULTS, bio: 'oops', posts: 'close_friends', unknown: true } };
    await expect(writeVisibilitySetting('p', { field: 'clips', level: 'friends' }, vi.fn())).rejects.toThrow('repair'); expect(state.update).not.toHaveBeenCalled();
    const value = await writeVisibilitySetting('p', { repair: true }, vi.fn());
    expect(value.fields).toEqual({ ...PROFILE_VISIBILITY_DEFAULTS, bio: 'only_me', posts: 'close_friends' });
  });
  it('guards after the transaction read before writing any changes', async () => {
    let current = true; state.get.mockImplementation(async () => { current = false; return { exists: () => false }; });
    const guard = () => { if (!current) throw new Error('account-changed'); };
    await expect(writeVisibilitySetting('p', { field: 'bio', level: 'public' }, guard)).rejects.toThrow('account-changed');
    expect(state.set).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled();
  });
  it('explicit repair replaces unsupported or malformed top-level metadata', async () => {
    state.row = { id: 'p', user_id: 'p', fields: { ...PROFILE_VISIBILITY_DEFAULTS }, extra: 'old', created_at: 42, updated_at: null };
    expect(parseVisibilitySettings(state.row, 'p').needsRepair).toBe(true);
    await writeVisibilitySetting('p', { repair: true }, vi.fn());
    expect(state.update).not.toHaveBeenCalled();
    expect(state.set).toHaveBeenCalledWith('profile_visibility/p', { id: 'p', user_id: 'p', fields: PROFILE_VISIBILITY_DEFAULTS, updated_at: expect.any(String) });
  });
  it('creates a canonical owned row only after a confirmed missing document', async () => {
    await writeVisibilitySetting('p', { field: 'stories', level: 'close_friends' }, vi.fn());
    expect(state.set).toHaveBeenCalledWith('profile_visibility/p', expect.objectContaining({ id: 'p', user_id: 'p', fields: { ...PROFILE_VISIBILITY_DEFAULTS, stories: 'close_friends' } }));
  });
});
