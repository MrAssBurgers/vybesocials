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
const entry = (savedId: string, themeId: string | null, createdAt = '', unavailable = false) => ({ savedId, themeId, createdAt, theme: unavailable || !themeId ? null : theme(themeId) });
const page = (values: unknown[], nextCursor: string | null = null, saved = true) => ({ ownerUid: actor.uid, profileId: actor.profileId, nextCursor, [saved ? 'references' : 'themes']: values });
const cursor = 'a'.repeat(48);
beforeEach(() => {
  vi.clearAllMocks(); mocks.getDocuments.mockResolvedValue([]);
  mocks.request.mockImplementation(async (_actor, _name, input) => receipt(theme(input.themeId)));
});

describe('current shared-theme admission', () => {
  it('deduplicates owned references and admits every detail before returning its contents', async () => {
    mocks.request.mockResolvedValueOnce(page([entry('a', 'one', '2025-01'), entry('b', 'two', '2025-02')], cursor))
      .mockResolvedValueOnce(page([entry('c', 'one', '2025-03')]));
    const result = await loadSavedThemes(actor.profileId, options);
    expect(result.themes.map(row => [row.id, row.saved_id])).toEqual([['one', 'c'], ['two', 'b']]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledWith(actor, 'manage-shared-theme', { action: 'listSaved', cursor }, undefined);
    expect(mocks.getDocuments).not.toHaveBeenCalled();
  });
  it('counts checked unavailable contents and malformed references without admitting old snapshots', async () => {
    mocks.request.mockResolvedValue(page([entry('a', 'visible'), entry('b', 'deleted', '', true), entry('c', 'revoked', '', true), entry('d', null)]));
    expect(await loadSavedThemes(actor.profileId, options)).toMatchObject({ themes: [{ id: 'visible' }], unavailableCount: 3 });
  });
  it.each(['not-found', 'unavailable', 'permission-denied'])('does not label a %s service error as an empty library', async code => {
    mocks.getDocuments.mockResolvedValue([reference('a', 'one')]); mocks.request.mockRejectedValue({ code });
    await expect(loadSavedThemes(actor.profileId, options)).rejects.toMatchObject({ code });
  });
  it('does not return a partial library after a later page fails', async () => {
    mocks.request.mockResolvedValueOnce(page([entry('a', 'one')], cursor)).mockRejectedValueOnce(new Error('Offline'));
    await expect(loadSavedThemes(actor.profileId, options)).rejects.toThrow('Offline'); expect(mocks.getDocuments).not.toHaveBeenCalled();
  });
  it('refuses a foreign library and an unexpected detail receipt', async () => {
    await expect(loadSavedThemes('other', options)).rejects.toThrow('identify');
    expect(mocks.request).not.toHaveBeenCalled();
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
  it('never reads raw public documents and loads only one checked page at a time', async () => {
    mocks.request.mockResolvedValue(page([theme('allowed', { theme_name: 'Current checked name' })], cursor, false));
    const result = await loadPublicSharedThemes(actor);
    expect(result.themes.map(row => row.theme_name)).toEqual(['Current checked name']); expect(result.nextCursor).toBe(cursor);
    expect(mocks.request).toHaveBeenCalledWith(actor, 'manage-shared-theme', { action: 'list', search: '' }, undefined);
    expect(mocks.request).toHaveBeenCalledTimes(1); expect(mocks.getDocuments).not.toHaveBeenCalled();
  });
  it('refuses extra/private public-list receipts and propagates admission failure', async () => {
    mocks.request.mockResolvedValue(page([theme('one', { is_public: false })], null, false));
    await expect(loadPublicSharedThemes(actor)).rejects.toThrow('verified');
    mocks.request.mockRejectedValue(new Error('Unavailable'));
    await expect(loadPublicSharedThemes(actor)).rejects.toThrow('Unavailable');
  });
  it('continues search explicitly and rejects a repeated or foreign cursor receipt', async () => {
    mocks.request.mockResolvedValue(page([theme('Ocean glow')], null, false));
    expect((await loadPublicSharedThemes(actor, 'Ocean', undefined, cursor)).themes).toHaveLength(1);
    expect(mocks.request).toHaveBeenCalledWith(actor, 'manage-shared-theme', { action: 'list', search: 'Ocean', cursor }, undefined);
    mocks.request.mockResolvedValue(page([], cursor, false));
    await expect(loadPublicSharedThemes(actor, '', undefined, cursor)).rejects.toThrow('advance');
    mocks.request.mockResolvedValue({ ...page([], null, false), ownerUid: 'other' });
    await expect(loadPublicSharedThemes(actor)).rejects.toThrow('verified');
  });
  it('drains a saved library larger than the former individual-read quota without truncation', async () => {
    for (let offset = 0; offset < 250; offset += 50) mocks.request.mockResolvedValueOnce(page(
      Array.from({ length: 50 }, (_, index) => entry(`save-${offset + index}`, `theme-${offset + index}`)),
      offset < 200 ? String(offset / 50 + 1).repeat(48) : null,
    ));
    const result = await loadSavedThemes(actor.profileId, options);
    expect(result.themes).toHaveLength(250); expect(result.unavailableCount).toBe(0); expect(mocks.request).toHaveBeenCalledTimes(5);
    expect(mocks.getDocuments).not.toHaveBeenCalled();
  });
  it('rejects duplicate references, repeating cursors and mismatched saved theme receipts', async () => {
    for (const invalid of [page([entry('a', 'one'), entry('a', 'one')]), page([{ ...entry('a', 'one'), theme: theme('wrong') }]), { ...page([]), profileId: 'other' }]) {
      mocks.request.mockResolvedValue(invalid); await expect(loadSavedThemes(actor.profileId, options)).rejects.toThrow('verified');
    }
    mocks.request.mockResolvedValue(page([], cursor));
    await expect(loadSavedThemes(actor.profileId, options)).rejects.toThrow('advance');
  });
  it('cancels between saved pages without exposing partial contents or reading ahead', async () => {
    const controller = new AbortController();
    mocks.request.mockImplementation(async () => { controller.abort(); return page([entry('a', 'one')], cursor); });
    await expect(loadSavedThemes(actor.profileId, { actor, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('honors a later revoked admission even when an earlier duplicate has the newer bookmark date', async () => {
    mocks.request.mockResolvedValueOnce(page([entry('new-reference', 'one', '2026-10-04')], cursor))
      .mockResolvedValueOnce(page([entry('old-reference', 'one', '2026-09-01', true)]));
    expect(await loadSavedThemes(actor.profileId, options)).toEqual({ themes: [], unavailableCount: 1 });
  });

});
