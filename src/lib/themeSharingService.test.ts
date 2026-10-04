import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndDeliverTheme, exportThemeCode, importThemeCode, changeThemeCollection } from './themeSharingService';
const state = vi.hoisted(() => ({ request: vi.fn(), send: vi.fn(), session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.request }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentsFromServer: vi.fn(), where: vi.fn(), firestoreLimit: vi.fn() }));
vi.mock('@/lib/sendShareToUser', () => ({ sendThemeToUser: state.send }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: (uid: string) => {
  const epoch = state.session.epoch; return () => { if (state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); };
} }));
const actor = { uid: 'alice', profileId: 'alice-profile', epoch: 1 };
const tokens = { colorPrimary: '220 80% 50%', colorSecondary: '270 70% 40%', colorAccent: '320 70% 50%', bgMain: '220 10% 10%', bgCard: '220 10% 15%', textPrimary: '0 0% 95%', textSecondary: '0 0% 70%', mode: 'dark' as const, borderRadius: 'large' as const };
const input = { themeName: 'Violet', themeTokens: tokens, visibility: 'friends' as const, recipientProfileIds: ['bob-profile', 'carol-profile'] };
const theme = { id: 'theme-one', creator_id: actor.profileId, theme_name: 'Violet', theme_tokens: tokens };
function response(payload: any) { return { data: { theme, requestId: payload.requestId, visibility: payload.visibility, recipientProfileIds: payload.recipientProfileIds, ownerUid: actor.uid, profileId: actor.profileId, action: payload.action, themeId: theme.id, code: payload.code || 'ABCDEFGH' }, error: null }; }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); state.session = { uid: 'alice', epoch: 1 };
  state.request.mockImplementation(async (_name, payload) => response(payload)); state.send.mockResolvedValue(true);
});
describe('checked theme sharing and retry receipts', () => {
  it('retries only failed friends without duplicating the theme or successful messages', async () => {
    state.send.mockImplementation(async payload => payload.recipientProfileId === 'bob-profile');
    await expect(createAndDeliverTheme(actor, input)).rejects.toThrow('Delivered to 1 of 2');
    const requestId = state.request.mock.calls[0][1].requestId;
    const failedMessageId = state.send.mock.calls[1][0].clientMessageId;
    state.send.mockResolvedValue(true);
    await expect(createAndDeliverTheme(actor, input)).resolves.toMatchObject({ row: { id: 'theme-one' } });
    expect(state.request.mock.calls[1][1].requestId).toBe(requestId);
    expect(state.send).toHaveBeenCalledTimes(3);
    expect(state.send.mock.calls[2][0]).toMatchObject({ recipientProfileId: 'carol-profile', clientMessageId: failedMessageId });
  });
  it('keeps creation identity after a lost acknowledgement and does not send before a receipt', async () => {
    const payload = { ...input, themeName: 'Lost acknowledgement' };
    state.request.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Disconnected' } });
    await expect(createAndDeliverTheme(actor, payload)).rejects.toThrow('Disconnected'); expect(state.send).not.toHaveBeenCalled();
    const id = state.request.mock.calls[0][1].requestId;
    await createAndDeliverTheme(actor, payload);
    expect(state.request.mock.calls[1][1].requestId).toBe(id);
  });
  it('rejects forged receipts before sending any message', async () => {
    state.request.mockImplementation(async (_name, payload) => ({ ...response(payload), data: { ...response(payload).data, ownerUid: 'other' } }));
    await expect(createAndDeliverTheme(actor, { ...input, themeName: 'Forged' })).rejects.toThrow('confirmed'); expect(state.send).not.toHaveBeenCalled();
  });
  it('does not continue delivery after an away-and-back account change', async () => {
    state.request.mockImplementation(async (_name, payload) => { state.session = { uid: 'alice', epoch: 3 }; return response(payload); });
    await expect(createAndDeliverTheme(actor, { ...input, themeName: 'Late account' })).rejects.toThrow('Account changed'); expect(state.send).not.toHaveBeenCalled();
  });
  it('does not send for private snapshots and requires matching collection receipts', async () => {
    await createAndDeliverTheme(actor, { themeName: 'Private', themeTokens: tokens, visibility: 'private' }); expect(state.send).not.toHaveBeenCalled();
    await changeThemeCollection(actor, 'save', 'theme-one');
    state.request.mockResolvedValue({ data: { action: 'save' }, error: null });
    await expect(changeThemeCollection(actor, 'like', 'theme-one')).rejects.toThrow('confirmed');
  });
  it('normalizes codes and never converts a missing code service into success', async () => {
    expect(await exportThemeCode(actor, 'theme-one')).toBe('ABCDEFGH');
    expect(await importThemeCode(actor, ' abcdefgh ')).toMatchObject({ id: 'theme-one' });
    await expect(importThemeCode(actor, 'short')).rejects.toThrow('eight-character');
    state.request.mockResolvedValue({ data: null, error: { name: 'not-found', message: 'Code service unavailable' } });
    await expect(importThemeCode(actor, 'BBBBBBBB')).rejects.toThrow('Code service unavailable');
  });
});
