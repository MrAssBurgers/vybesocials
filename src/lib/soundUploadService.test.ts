import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn(), cancel: vi.fn(), epoch: 1, uid: 'alice', storageFailure: false, uploadPending: false }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}), ref: (_storage: unknown, path: string) => path, uploadBytesResumable: state.upload }));
vi.mock('@/lib/firebase/app', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('@/lib/firebase/config', () => ({ getFirebaseConfig: () => ({ storageBucket: 'test.appspot.com' }) }));
vi.mock('@/lib/firebase/localPreview', () => ({ isLocalPreview: () => false, LOCAL_PREVIEW_PROJECT: 'demo-vybe-preview' }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { captureSoundActor, publishOriginalSound, readSoundLibrary, soundContentType, soundUploadRequest } from './soundUploadService';
const id = 'a'.repeat(64), actor = () => captureSoundActor('alice', 'profile-alice');
const receipt = (status = 'uploading') => ({ success: true, ownerUid: 'alice', profileId: 'profile-alice', uploadId: id, status, sourcePath: `sound-uploads/alice/${id}/source`, expiresAt: Date.now() + 10000, soundId: status === 'published' ? id : null });
const file = () => { const value = new File(['real selected audio bytes'], 'original.wav', { type: 'audio/wav' }); Object.defineProperty(value, 'arrayBuffer', { value: async () => new TextEncoder().encode('real selected audio bytes').buffer }); return value; };
const input = () => ({ file: file(), title: crypto.randomUUID(), tags: ['original'], publicConsent: true });
const publish = (data = input(), signal = new AbortController().signal) => publishOriginalSound(data, actor(), signal, vi.fn(), vi.fn());
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; state.uid = 'alice'; state.storageFailure = false; state.uploadPending = false; sessionStorage.clear(); vi.stubGlobal('crypto', webcrypto); state.upload.mockImplementation(() => ({ cancel: state.cancel, on: (_event: string, progress: (value: unknown) => void, error: (error: unknown) => void, done: () => void) => { if (!state.uploadPending) queueMicrotask(() => { progress({ bytesTransferred: 25, totalBytes: 25 }); if (state.storageFailure) error(new Error('lost upload acknowledgement')); else done(); }); } })); state.invoke.mockImplementation(async (_name, payload) => ({ data: receipt(payload.action === 'reserve' ? 'uploading' : 'published'), error: null })); });
afterEach(() => vi.unstubAllGlobals());
it('sends the selected file bytes to the exact reserved path and publishes only after finalize', async () => {
  const data = input(); const result = await publish(data); expect(result.status).toBe('published'); expect(state.upload).toHaveBeenCalledWith(`sound-uploads/alice/${id}/source`, data.file, { contentType: 'audio/wav' });
  expect(state.invoke.mock.calls.map(call => call[1].action)).toEqual(['reserve', 'finalize']); expect(state.invoke.mock.calls[0][1]).toMatchObject({ expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', publicConsent: true, byteSize: data.file.size, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
});
it('recovers an immutable completed upload after a lost Storage acknowledgement', async () => { state.storageFailure = true; expect((await publish()).status).toBe('published'); expect(state.invoke).toHaveBeenCalledTimes(2); });
it('keeps the same durable request identity after a lost finalize response', async () => {
  const data = input(); let fail = true; state.invoke.mockImplementation(async (_name, payload) => ({ data: payload.action === 'reserve' ? receipt() : fail ? null : receipt('published'), error: payload.action !== 'reserve' && fail ? { message: 'Response lost' } : null }));
  await expect(publish(data)).rejects.toThrow('Response lost'); const first = state.invoke.mock.calls[0][1].requestId; expect(Object.keys(sessionStorage).some(key => key.startsWith('vybe.sound-upload.'))).toBe(true);
  fail = false; await publish(data); expect(state.invoke.mock.calls.filter(call => call[1].action === 'reserve').map(call => call[1].requestId)).toEqual([first, first]); expect(Object.keys(sessionStorage).filter(key => key.startsWith('vybe.sound-upload.'))).toHaveLength(0);
});
it('does not upload again when reserve recovers an already published receipt', async () => { state.invoke.mockResolvedValue({ data: receipt('published'), error: null }); await publish(); expect(state.upload).not.toHaveBeenCalled(); });
it.each([{ success: true }, { ...receipt('published'), ownerUid: 'bob' }, { ...receipt('published'), soundId: 'b'.repeat(64) }, { ...receipt(), sourcePath: 'arbitrary/object' }])('rejects incomplete, foreign and mismatched receipts', async data => { state.invoke.mockResolvedValue({ data, error: null }); await expect(soundUploadRequest(actor(), { action: 'finalize', uploadId: id })).rejects.toThrow(/receipt/); });
it('does not start Storage after account changes during reservation', async () => {
  const own = actor(); state.invoke.mockImplementation(async () => { state.epoch += 2; return { data: receipt(), error: null }; }); await expect(publishOriginalSound(input(), own, new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('Account changed'); expect(state.upload).not.toHaveBeenCalled();
});
it('cancels the real resumable task when the upload is aborted', async () => {
  state.uploadPending = true; const controller = new AbortController(); const pending = publish(input(), controller.signal); await vi.waitFor(() => expect(state.upload).toHaveBeenCalled()); controller.abort(); await expect(pending).rejects.toHaveProperty('name', 'AbortError'); expect(state.cancel).toHaveBeenCalled(); expect(state.invoke.mock.calls.map(call => call[1].action)).toEqual(['reserve']);
});
it('requires public consent before any network request and never infers arbitrary MIME', async () => {
  await expect(publish({ ...input(), publicConsent: false })).rejects.toThrow(/public sharing/); expect(state.invoke).not.toHaveBeenCalled(); expect(soundContentType(new File(['audio'], 'x.wav', { type: 'text/html' }))).toBe(''); expect(soundContentType(new File(['audio'], 'x.m4a'))).toBe('audio/mp4');
});
const sound = () => ({ sound_id: id, title: 'Original audio', artist: 'Creator', duration: 0.5, tags: [], moderation_status: 'not_reviewed', created_at: new Date().toISOString(), audio_url: `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/original-sounds%2Falice%2F${id}%2Faudio.wav?alt=media&token=public`, preview_url: `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/original-sounds%2Falice%2F${id}%2Faudio.wav?alt=media&token=public` });
it('accepts checked current library records and a real empty removal receipt', async () => { state.invoke.mockResolvedValue({ data: { success: true, ownerUid: 'alice', profileId: 'profile-alice', sounds: [sound()], nextCursor: null }, error: null }); expect((await readSoundLibrary(actor(), { action: 'get', soundId: id })).sounds).toHaveLength(1); state.invoke.mockResolvedValue({ data: { success: true, ownerUid: 'alice', profileId: 'profile-alice', sounds: [], nextCursor: null }, error: null }); expect((await readSoundLibrary(actor(), { action: 'get', soundId: id })).sounds).toEqual([]); });
it.each(['http://127.0.0.1/private', 'file:///secret', 'https://evil.test/v0/b/test.appspot.com/o/original-sounds%2Fx?alt=media&token=x'])('rejects unsafe library audio %s', async url => { state.invoke.mockResolvedValue({ data: { success: true, ownerUid: 'alice', profileId: 'profile-alice', sounds: [{ ...sound(), audio_url: url }], nextCursor: null }, error: null }); await expect(readSoundLibrary(actor(), { action: 'get', soundId: id })).rejects.toThrow(); });
it('rejects repeated cursors and cross-account library receipts', async () => { const cursor = 'b'.repeat(32); state.invoke.mockResolvedValue({ data: { success: true, ownerUid: 'alice', profileId: 'profile-alice', sounds: [], nextCursor: cursor }, error: null }); await expect(readSoundLibrary(actor(), { action: 'list', kind: 'new', cursor })).rejects.toThrow(); state.invoke.mockResolvedValue({ data: { success: true, ownerUid: 'bob', profileId: 'profile-bob', sounds: [], nextCursor: null }, error: null }); await expect(readSoundLibrary(actor(), { action: 'list', kind: 'new' })).rejects.toThrow(); });

it.each(['expired', 'cancelled'])('clears only a confirmed %s unpublished receipt so the retained file can be retried', async status => {
  const data = input(); state.invoke.mockResolvedValueOnce({ data: receipt(status), error: null }); await expect(publish(data)).rejects.toThrow(/Press Publish sound again/); const oldRequest = state.invoke.mock.calls[0][1].requestId;
  await publish(data); expect(state.invoke.mock.calls[1][1].requestId).not.toBe(oldRequest);
});
