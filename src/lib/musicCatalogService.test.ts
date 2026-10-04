import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== 'alice' || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { readMusicCatalog, safeAudioSource } from './musicCatalogService';
const track = { track_id: 'tone', title: 'App tone', artist: 'VYBE', genre: 'Effects', duration: 1, preview_url: '/sounds/comment.wav', preview_seconds: 1, artwork_url: null, asset_kind: 'app_sound_effect' };
beforeEach(() => { state.epoch = 1; state.invoke.mockReset(); state.invoke.mockResolvedValue({ data: { ownerUid: 'alice', profileId: 'profile-a', tracks: [track], nextCursor: null, unavailableCount: 0 }, error: null }); });
describe('checked catalog reads', () => {
  it('binds profile/account and pagination to the existing callable', async () => {
    expect((await readMusicCatalog('alice', 'profile-a', 'cursor')).tracks).toEqual([track]);
    expect(state.invoke).toHaveBeenCalledWith('read-music-catalog', { expectedOwnerUid: 'alice', expectedProfileId: 'profile-a', cursor: 'cursor' });
  });
  it('distinguishes unavailable service from an approved empty page', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: { message: 'missing' } }); await expect(readMusicCatalog('alice', 'profile-a')).rejects.toThrow(/could not be loaded/);
    state.invoke.mockResolvedValueOnce({ data: { ownerUid: 'alice', profileId: 'profile-a', tracks: [], nextCursor: 'more', unavailableCount: 25 } });
    expect(await readMusicCatalog('alice', 'profile-a')).toEqual({ tracks: [], nextCursor: 'more', unavailableCount: 25 });
  });
  it('rejects mismatched identity, malformed media and duplicate rows', async () => {
    for (const patch of [{ ownerUid: 'bob' }, { tracks: [{ ...track, preview_url: '' }] }, { tracks: [track, track] }, { tracks: [{ ...track, preview_seconds: 31 }] }]) {
      state.invoke.mockResolvedValueOnce({ data: { ownerUid: 'alice', profileId: 'profile-a', tracks: [track], nextCursor: null, unavailableCount: 0, ...patch } }); await expect(readMusicCatalog('alice', 'profile-a')).rejects.toThrow(/verified/);
    }
  });
  it('drops late ABA response and never initiates without a bound account', async () => {
    let resolve!: (value: unknown) => void; state.invoke.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    const pending = readMusicCatalog('alice', 'profile-a'); state.epoch = 3; resolve({ data: {} }); await expect(pending).rejects.toThrow(/changed/);
    await expect(readMusicCatalog('', 'profile-a')).rejects.toThrow(/changed/); expect(state.invoke).toHaveBeenCalledTimes(1);
  });
  it('rejects a response that repeats the requested cursor', async () => {
    state.invoke.mockResolvedValueOnce({ data: { ownerUid: 'alice', profileId: 'profile-a', tracks: [track], nextCursor: 'cursor-a', unavailableCount: 0 } });
    await expect(readMusicCatalog('alice', 'profile-a', 'cursor-a')).rejects.toThrow(/verified/);
  });
  it.each(['', 'http://example.com/audio.wav', '//example.com/a', 'file:///tmp/a', 'data:audio/wav;base64,AA', 'https://user:pass@example.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://foo.internal/a', '/sounds/unknown.wav'])('rejects unsafe source %s', source => { expect(safeAudioSource(source)).toBe(false); });
});
