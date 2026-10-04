import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSavedTheme, loadOwnSharedThemes, loadSavedThemes, loadSharedTheme, normalizeSharedTheme, loadPublicSharedThemes } from './sharedThemeRepository';

const mocks = vi.hoisted(() => ({ getDocuments: vi.fn(), request: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  getDocumentsFromServer: (...args: any[]) => args[1]?.[0]?.value === 'owner-auth' ? Promise.resolve([]) : mocks.getDocuments(...args),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  firestoreLimit: (value: number) => ({ limit: value }), orderBy: (field: string, dir: string) => ({ field, dir }),
}));
vi.mock('@/lib/themeAuthorityClient', () => ({ themeAuthorityRequest: mocks.request }));
const actor = { uid: 'owner-auth', profileId: 'owner-profile', epoch: 1 };
const options = { actor };
const tokens = { colorPrimary: '220 80% 50%', colorSecondary: '270 70% 40%', colorAccent: '320 70% 50%', bgMain: '220 10% 10%', bgCard: '220 10% 15%', textPrimary: '0 0% 95%', textSecondary: '0 0% 70%', mode: 'dark', borderRadius: 'large' };
const theme = (id: string, extra = {}) => ({ id, creator_id: 'creator-profile', theme_name: id, theme_tokens: tokens, is_public: true, ...extra });
const receipt = (value: unknown) => ({ theme: value, ownerUid: actor.uid, profileId: actor.profileId });
const reference = (id: string, themeId: string, createdAt = '') => ({ id, shared_theme_id: themeId, user_id: actor.profileId, created_at: createdAt });
beforeEach(() => {
  vi.clearAllMocks(); mocks.getDocuments.mockResolvedValue([]);
  mocks.request.mockImplementation(async (_actor, _name, input) => receipt(theme(input.themeId)));
});

describe('current shared-theme admission', () => {
  it('deduplicates owned references and admits every detail before returning its contents', async () => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'one', '2025-01'), reference('b', 'two', '2025-02'), reference('c', 'one', '2025-03')]);
    const result = await loadSavedThemes(actor.profileId, options);
    expect(result.themes.map(row => [row.id, row.saved_id])).toEqual([['one', 'c'], ['two', 'b']]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledWith(actor, 'manage-shared-theme', { action: 'read', themeId: 'one' }, undefined);
  });
  it('counts checked unavailable contents and malformed references without admitting old snapshots', async () => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'visible'), reference('b', 'deleted'), reference('c', 'revoked'), reference('d', '../invalid')]);
    mocks.request.mockImplementation(async (_a, _n, input) => receipt(input.themeId === 'visible' ? theme('visible') : null));
    expect(await loadSavedThemes(actor.profileId, options)).toMatchObject({ themes: [{ id: 'visible' }], unavailableCount: 3 });
  });
  it.each(['not-found', 'unavailable', 'permission-denied'])('does not label a %s service error as an empty library', async code => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'one')]); mocks.request.mockRejectedValue({ code });
    await expect(loadSavedThemes(actor.profileId, options)).rejects.toMatchObject({ code });
  });
  it('keeps library query failures retryable', async () => {
    mocks.getDocuments.mockRejectedValue(new Error('Offline'));
    await expect(loadSavedThemes(actor.profileId, options)).rejects.toThrow('Offline'); expect(mocks.request).not.toHaveBeenCalled();
  });
  it('ignores foreign references and refuses an unexpected detail receipt', async () => {
    mocks.getDocuments.mockResolvedValue([{ ...reference('a', 'private'), user_id: 'other' }]);
    expect(await loadSavedThemes(actor.profileId, options)).toEqual({ themes: [], unavailableCount: 0 });
    mocks.request.mockResolvedValue(receipt(theme('wrong')));
    await expect(loadSharedTheme('one', options)).rejects.toThrow('verified');
  });
  it('rejects a response for another account', async () => {
    mocks.request.mockResolvedValue({ ...receipt(theme('one')), ownerUid: 'other' });
    await expect(loadSharedTheme('one', options)).rejects.toThrow('confirmed');
  });
  it('cancels before reading details or returning a late response', async () => {
    const controller = new AbortController();
    mocks.request.mockImplementation(async () => { controller.abort(); return receipt(theme('one')); });
    await expect(loadSharedTheme('one', { actor, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(loadSavedThemes(actor.profileId, { actor, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.getDocuments).not.toHaveBeenCalled();
  });
  it('retains legacy own themes without timestamps and checks existing save references', async () => {
    mocks.getDocuments.mockImplementation(async (_table, filters) => filters[0].value === actor.profileId ? [theme('old', { creator_id: actor.profileId }), theme('new', { creator_id: actor.profileId, created_at: '2025-01' })] : []);
    expect((await loadOwnSharedThemes(actor.profileId, options)).map(row => row.id)).toEqual(['new', 'old']);
    mocks.getDocuments.mockResolvedValue([reference('existing', 'one')]); expect(await hasSavedTheme(actor.profileId, 'one')).toBe(true);
  });
  it('strips unknown CSS and refuses malformed colors, enums and non-finite effects before rendering', () => {
    expect(normalizeSharedTheme(theme('one', { theme_tokens: { ...tokens, arbitraryCSS: 'url(https://example.test)' } }), 'one')?.theme_tokens).not.toHaveProperty('arbitraryCSS');
    for (const bad of [{ colorPrimary: 'url(1)' }, { bgMain: '999 0% 0%' }, { mode: 'other' }, { backgroundBlur: NaN }, { backgroundImage: 'javascript:1' }]) {
      expect(normalizeSharedTheme(theme('one', { theme_tokens: { ...tokens, ...bad } }), 'one')).toBeNull();
    }
  });
  it('treats raw public rows only as candidates and never displays a denied creator or stale payload', async () => {
    mocks.getDocuments.mockResolvedValue([theme('allowed', { theme_name: 'Old unsafe snapshot' }), theme('blocked')]);
    mocks.request.mockResolvedValue({ ownerUid: actor.uid, profileId: actor.profileId, themes: [theme('allowed', { theme_name: 'Current checked name' })] });
    const result = await loadPublicSharedThemes(actor);
    expect(result.map(row => row.theme_name)).toEqual(['Current checked name']);
    expect(mocks.request).toHaveBeenCalledWith(actor, 'manage-shared-theme', { action: 'readMany', themeIds: ['allowed', 'blocked'] }, undefined);
  });
  it('refuses extra/private public-list receipts and propagates admission failure', async () => {
    mocks.getDocuments.mockResolvedValue([theme('one')]);
    mocks.request.mockResolvedValue({ ownerUid: actor.uid, profileId: actor.profileId, themes: [theme('one', { is_public: false })] });
    await expect(loadPublicSharedThemes(actor)).rejects.toThrow('verified');
    mocks.request.mockRejectedValue(new Error('Unavailable'));
    await expect(loadPublicSharedThemes(actor)).rejects.toThrow('Unavailable');
  });

});
