import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), blob: vi.fn(), ref: vi.fn((storage, path) => path) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mocks.invoke }));
vi.mock('@/lib/firebase/app', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/storage', () => ({ getBlob: mocks.blob, getStorage: () => ({}), ref: mocks.ref }));
import { getGameCapture, completeGameCapture, discardGameCapture, downloadGameCapture, GameCaptureError, gameCaptureErrorMessage } from './gameCaptureService';
const id = 'a'.repeat(48);
const capture = () => ({ captureId: id, status: 'ready' as const, gameId: 'test-game', gameName: 'Test Game', contentType: 'image/png' as const, byteSize: 12, caption: '', tags: [], storagePath: `game-captures/player/${id}`, expiresAt: Date.now() + 600_000, postId: null, reviewUrl: 'https://evil.test/' });
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: capture(), error: null }); });
describe('game capture review service boundary', () => {
  it('validates the receipt and rebuilds a trusted review link', async () => {
    expect(await getGameCapture(id)).toMatchObject({ captureId: id, reviewUrl: `https://vybehub.app/game-capture/${id}` });
  });
  it.each([{ captureId: 'b'.repeat(48) }, { storagePath: `posts/player/${id}` }, { byteSize: 49 * 1024 * 1024 }, { contentType: 'text/html' }, { status: 'imported', postId: null }, { status: 'imported', postId: 'foreign-post' }, { tags: 'bad' }, { expiresAt: NaN }])('rejects a malformed capture response %j', async patch => {
    mocks.invoke.mockResolvedValueOnce({ data: { ...capture(), ...patch }, error: null });
    await expect(getGameCapture(id)).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('rejects malformed input before contacting the callable', async () => {
    await expect(getGameCapture('../wrong')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(completeGameCapture(id, 'wrong-post')).rejects.toMatchObject({ code: 'invalid-argument' }); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('requires a confirmed imported receipt and confirmed discard response', async () => {
    await expect(completeGameCapture(id, `game_${id}`)).rejects.toMatchObject({ code: 'invalid-response' });
    mocks.invoke.mockResolvedValueOnce({ data: { ...capture(), status: 'imported', postId: `game_${id}` }, error: null });
    expect((await completeGameCapture(id, `game_${id}`)).status).toBe('imported');
    mocks.invoke.mockResolvedValueOnce({ data: { ok: false }, error: null }); await expect(discardGameCapture(id)).rejects.toMatchObject({ code: 'invalid-response' });
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null }); await expect(discardGameCapture(id)).resolves.toEqual({ ok: true });
  });
  it('retains normalized error codes for truthful recovery', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'failed-precondition', message: 'Already published' } });
    await expect(discardGameCapture(id)).rejects.toMatchObject({ code: 'failed-precondition', message: 'Already published' });
    expect(gameCaptureErrorMessage(new GameCaptureError('functions/unavailable', 'raw error'))).toMatch(/could not be reached/);
    expect(gameCaptureErrorMessage(new GameCaptureError('unauthenticated', 'raw error'))).toMatch(/Sign in again/);
  });
  it('downloads through authenticated storage and validates file details', async () => {
    mocks.blob.mockResolvedValueOnce(new Blob([new Uint8Array(12)], { type: 'image/png' }));
    expect(await downloadGameCapture(capture())).toBeInstanceOf(File);
    expect(mocks.blob).toHaveBeenCalledWith(`game-captures/player/${id}`, 48 * 1024 * 1024);
    mocks.blob.mockResolvedValueOnce(new Blob([new Uint8Array(12)], { type: 'image/jpeg' }));
    await expect(downloadGameCapture(capture())).rejects.toThrow('details changed');
  });
  it('refuses expired or uploading media before storage access', async () => {
    await expect(downloadGameCapture({ ...capture(), expiresAt: Date.now() - 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(downloadGameCapture({ ...capture(), status: 'uploading' })).rejects.toMatchObject({ code: 'failed-precondition' }); expect(mocks.blob).not.toHaveBeenCalled();
  });
});
