import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSavedTheme, loadOwnSharedThemes, loadSavedThemes, loadSharedTheme } from './sharedThemeRepository';

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), getDocuments: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  getDocumentFromServer: mocks.getDocument, getDocumentsFromServer: mocks.getDocuments,
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  firestoreLimit: (value: number) => ({ limit: value }),
}));
const theme = (id: string, extra = {}) => ({ id, creator_id: 'creator-profile', theme_name: id, theme_tokens: { colorPrimary: '220 80% 50%', mode: 'dark' }, is_public: true, ...extra });
const reference = (id: string, themeId: string, createdAt = '') => ({ id, shared_theme_id: themeId, user_id: 'owner-profile', created_at: createdAt });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDocuments.mockResolvedValue([]);
  mocks.getDocument.mockImplementation(async (table: string, id: string) => table === 'shared_themes' ? theme(id) : { username: 'creator', display_name: 'Creator' });
});

describe('explicit saved-theme reads', () => {
  it('queries only owned references and deduplicates snapshots in latest-save order', async () => {
    mocks.getDocuments.mockResolvedValue([
      reference('old-save', 'theme-one', '2025-01'), reference('other', 'theme-two', '2025-02'),
      reference('new-save', 'theme-one', '2025-03'), reference('imported-without-date', 'theme-three'),
    ]);
    const result = await loadSavedThemes('owner-profile');
    expect(mocks.getDocuments).toHaveBeenCalledWith('saved_themes', [{ field: 'user_id', op: '==', value: 'owner-profile' }]);
    expect(result.themes.map(row => [row.id, row.saved_id])).toEqual([
      ['theme-one', 'new-save'], ['theme-two', 'other'], ['theme-three', 'imported-without-date'],
    ]);
    expect(mocks.getDocument.mock.calls.filter(([table]) => table === 'shared_themes')).toHaveLength(3);
    expect(result.themes[0].creator).toMatchObject({ username: 'creator' });
    expect(result.unavailableCount).toBe(0);
  });

  it('keeps accessible themes while counting missing, inaccessible and malformed references', async () => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'owned-private'), reference('b', 'deleted'), reference('c', 'now-private'), reference('d', 'bad-tokens'), reference('e', '../invalid')]);
    mocks.getDocument.mockImplementation(async (table: string, id: string) => {
      if (table === 'profiles') return null;
      if (id === 'deleted') return null;
      if (id === 'now-private') throw { code: 'permission-denied' };
      if (id === 'bad-tokens') return theme(id, { theme_tokens: {} });
      return theme(id, { creator_id: 'owner-profile', is_public: false });
    });
    const result = await loadSavedThemes('owner-profile');
    expect(result.themes.map(row => row.id)).toEqual(['owned-private']);
    expect(result.themes[0].is_public).toBe(false);
    expect(result.unavailableCount).toBe(4);
    expect(mocks.getDocument).not.toHaveBeenCalledWith('shared_themes', '../invalid');
  });

  it('never converts a library query failure into an empty collection', async () => {
    const error = { code: 'permission-denied', message: 'Library denied' };
    mocks.getDocuments.mockRejectedValue(error);
    await expect(loadSavedThemes('owner-profile')).rejects.toBe(error);
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it('propagates transient theme read errors for retry instead of declaring a theme removed', async () => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'theme-one')]);
    mocks.getDocument.mockRejectedValue({ code: 'unavailable' });
    await expect(loadSavedThemes('owner-profile')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('ignores unexpected references owned by another profile', async () => {
    mocks.getDocuments.mockResolvedValue([{ ...reference('a', 'other-private'), user_id: 'other-profile' }]);
    expect(await loadSavedThemes('owner-profile')).toEqual({ themes: [], unavailableCount: 0 });
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it('stops a cancelled account request before resolving its references', async () => {
    const controller = new AbortController();
    mocks.getDocuments.mockImplementation(async () => { controller.abort(); return [reference('a', 'private')]; });
    await expect(loadSavedThemes('owner-profile', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it('stops a cancelled detail read before creator reads or returning private data', async () => {
    const controller = new AbortController();
    mocks.getDocument.mockImplementation(async () => { controller.abort(); return theme('private'); });
    await expect(loadSharedTheme('private', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.getDocument).toHaveBeenCalledTimes(1);
  });

  it('loads own private snapshots without dropping imported rows lacking timestamps', async () => {
    mocks.getDocuments.mockResolvedValue([theme('old', { creator_id: 'owner-profile', is_public: false }), theme('new', { creator_id: 'owner-profile', created_at: '2025-01' })]);
    expect((await loadOwnSharedThemes('owner-profile')).map(row => row.id)).toEqual(['new', 'old']);
    expect(mocks.getDocuments).toHaveBeenCalledWith('shared_themes', [{ field: 'creator_id', op: '==', value: 'owner-profile' }]);
  });

  it('normalizes absent counters and resolves a migrated Auth UID creator explicitly', async () => {
    mocks.getDocument.mockImplementation(async (table: string) => table === 'shared_themes' ? theme('wrong-stored-id', { creator_id: 'creator-auth', likes_count: -1, downloads_count: NaN }) : null);
    mocks.getDocuments.mockResolvedValue([{ user_id: 'creator-auth', username: 'legacy-creator' }]);
    expect(await loadSharedTheme('actual-doc-id')).toMatchObject({ id: 'actual-doc-id', likes_count: 0, downloads_count: 0, creator: { username: 'legacy-creator' } });
    expect(mocks.getDocuments).toHaveBeenCalledWith('profiles', [{ field: 'user_id', op: '==', value: 'creator-auth' }, { limit: 1 }]);
  });

  it('keeps denied detail reads private without requesting another endpoint', async () => {
    mocks.getDocument.mockRejectedValue({ code: 'firestore/permission-denied' });
    expect(await loadSharedTheme('someone-private')).toBeNull();
    expect(mocks.getDocument).toHaveBeenCalledTimes(1);
    expect(mocks.getDocuments).not.toHaveBeenCalled();
  });

  it('recognizes a previously saved reference without inserting another one', async () => {
    mocks.getDocuments.mockResolvedValue([reference('existing', 'theme-one')]);
    expect(await hasSavedTheme('owner-profile', 'theme-one')).toBe(true);
    expect(mocks.getDocuments).toHaveBeenCalledWith('saved_themes', [
      { field: 'user_id', op: '==', value: 'owner-profile' }, { field: 'shared_theme_id', op: '==', value: 'theme-one' }, { limit: 1 },
    ]);
  });
});
