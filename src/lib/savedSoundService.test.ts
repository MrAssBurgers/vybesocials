import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/soundUploadService', () => ({ parseLibrarySound: (value: { sound_id: string }, expected: string) => { if (value.sound_id !== expected) throw new Error('Wrong sound'); return value; } }));
import { getSoundSaved, listSavedSounds, updateSavedSound } from './savedSoundService';
const id = 'a'.repeat(64), actor = { uid: 'alice', profileId: 'profile-alice', guard: vi.fn() };
const base = { success: true, ownerUid: 'alice', profileId: 'profile-alice' };
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
it('sends derived owner/profile and retains the same request after a lost response', async () => {
  state.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Lost acknowledgement' } }).mockResolvedValueOnce({ data: { ...base, soundId: id, saved: true }, error: null });
  await expect(updateSavedSound(actor, { action: 'set', soundId: id, saved: true })).rejects.toThrow('Lost acknowledgement');
  const first = state.invoke.mock.calls[0][1]; await expect(updateSavedSound(actor, { action: 'set', soundId: id, saved: true })).resolves.toBe(true);
  expect(state.invoke.mock.calls[1][1]).toEqual(first); expect(first).toMatchObject({ expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', saved: true, requestId: expect.any(String) });
});
it('reports current saved state from a replay instead of claiming the old action won', async () => { state.invoke.mockResolvedValue({ data: { ...base, soundId: id, saved: false }, error: null }); expect(await updateSavedSound(actor, { action: 'set', soundId: id, saved: true })).toBe(false); });
it.each([{ ...base, ownerUid: 'bob', soundId: id, saved: true }, { ...base, soundId: 'b'.repeat(64), saved: true }, { ...base, soundId: id, saved: 'yes' }, { ok: true }])('rejects forged or incomplete mutation receipts', async data => { state.invoke.mockResolvedValue({ data, error: null }); await expect(updateSavedSound(actor, { action: 'set', soundId: id, saved: false })).rejects.toThrow(/receipt|verified/); });
it('distinguishes a failed saved-status lookup from unsaved', async () => { state.invoke.mockResolvedValue({ data: null, error: { message: 'Permission check failed' } }); await expect(getSoundSaved(actor, id)).rejects.toThrow('Permission check failed'); });
it('retains unavailable and inert legacy references without inventing audio', async () => { state.invoke.mockResolvedValue({ data: { ...base, entries: [{ referenceId: id, soundId: id, legacy: false, sound: null }, { referenceId: 'old', soundId: null, legacy: true, sound: null }], nextCursor: null }, error: null }); const result = await listSavedSounds(actor); expect(result.entries).toHaveLength(2); expect(result.entries.every(entry => entry.sound === null)).toBe(true); });
it('rejects a legacy receipt with a private cached sound payload', async () => { state.invoke.mockResolvedValue({ data: { ...base, entries: [{ referenceId: 'old', soundId: id, legacy: true, sound: { sound_id: id } }], nextCursor: null }, error: null }); await expect(listSavedSounds(actor)).rejects.toThrow(); });
it('rejects repeating pagination and foreign sound snapshots', async () => { const cursor = 'a'.repeat(32); state.invoke.mockResolvedValueOnce({ data: { ...base, entries: [], nextCursor: cursor }, error: null }).mockResolvedValueOnce({ data: { ...base, entries: [{ referenceId: id, soundId: id, legacy: false, sound: { sound_id: 'b'.repeat(64) } }], nextCursor: null }, error: null }); await expect(listSavedSounds(actor, cursor)).rejects.toThrow(); await expect(listSavedSounds(actor)).rejects.toThrow('Wrong sound'); });
it('guards before and after awaited network work', async () => { state.invoke.mockImplementation(async () => { actor.guard.mockImplementation(() => { throw new Error('Account changed'); }); return { data: { ...base, soundId: id, saved: true }, error: null }; }); await expect(getSoundSaved(actor, id)).rejects.toThrow('Account changed'); actor.guard.mockReset(); });

it('does not claim a recreated legacy reference was removed by an old retry', async () => {
  state.invoke.mockResolvedValueOnce({ data: { ...base, referenceId: 'recreated', removed: false }, error: null }).mockResolvedValueOnce({ data: { ...base, referenceId: 'recreated', removed: true }, error: null });
  await expect(updateSavedSound(actor, { action: 'removeLegacy', referenceId: 'recreated' })).rejects.toThrow(/exists again/); const old = state.invoke.mock.calls[0][1].requestId;
  await updateSavedSound(actor, { action: 'removeLegacy', referenceId: 'recreated' }); expect(state.invoke.mock.calls[1][1].requestId).not.toBe(old);
});
