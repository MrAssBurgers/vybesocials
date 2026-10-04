import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
const state = vi.hoisted(() => ({
  user: { uid: 'alice' } as { uid: string } | null,
  listeners: new Set<(user: { uid: string } | null) => void>(),
  call: vi.fn(), upload: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ getAuth: () => ({
  get currentUser() { return state.user; },
  onAuthStateChanged: (callback: (user: { uid: string } | null) => void) => {
    state.listeners.add(callback); return () => state.listeners.delete(callback);
  },
}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: (_: unknown, name: string) => async (input: unknown) => ({ data: await state.call(name, input) }) }));
vi.mock('firebase/storage', () => ({ getStorage: () => ({}), ref: (_: unknown, path: string) => path, uploadBytesResumable: (...args: unknown[]) => state.upload(...args) }));
import { createFirebaseGameClient } from '../../sdk/game/firebase';
import type { CaptureRequest } from '../../sdk/game';

const id = 'a'.repeat(48);
const receipt = { captureId: id, status: 'uploading', gameId: 'test-game', gameName: 'Test', byteSize: 20, contentType: 'image/png', caption: '', tags: [], storagePath: `game-captures/alice/${id}`, expiresAt: Date.now() + 60_000, postId: null };
const input: CaptureRequest = { gameId: 'test-game', idempotencyKey: 'capture-key-123', media: new Uint8Array(20), contentType: 'image/png' };
function switchTo(uid: string | null) { state.user = uid ? { uid } : null; for (const callback of [...state.listeners]) callback(state.user); }
const client = () => createFirebaseGameClient({} as FirebaseApp);

beforeEach(() => { state.call.mockReset(); state.upload.mockReset(); state.listeners.clear(); switchTo('alice'); });
describe('first-party Firebase game SDK account lifetime', () => {
  it('stops a preparing callback from changing the account before reservation', async () => {
    await expect(client().stageCapture({ ...input, onPhase: () => switchTo('bob') })).rejects.toThrow('account changed');
    expect(state.call).not.toHaveBeenCalled(); expect(state.listeners.size).toBe(0);
  });
  it.each([false, true])('rejects a late reservation after account switch (same UID again=%s)', async returning => {
    let finish!: (value: unknown) => void;
    state.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const reserved = vi.fn(), phase = vi.fn();
    const pending = client().stageCapture({ ...input, onCaptureReserved: reserved, onPhase: phase });
    switchTo('bob'); if (returning) switchTo('alice');
    finish(receipt);
    await expect(pending).rejects.toThrow('account changed');
    expect(reserved).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(phase).not.toHaveBeenCalledWith('ready');
    expect(state.listeners.size).toBe(0);
  });
  it.each(['getCapture', 'finishCapture', 'discardCapture'] as const)('binds %s and rejects late success', async method => {
    let finish!: (value: unknown) => void;
    state.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = client()[method](id);
    expect(state.call).toHaveBeenCalledWith(expect.any(String), { captureId: id, expectedOwnerUid: 'alice' });
    switchTo('bob'); finish(method === 'discardCapture' ? { ok: true } : receipt);
    await expect(pending).rejects.toThrow('account changed'); expect(state.listeners.size).toBe(0);
  });
  it('cancels active transfer and suppresses later progress after account change', async () => {
    const cancel = vi.fn(); let update!: (snapshot: unknown) => void; let reject!: (error: Error) => void;
    state.upload.mockReturnValue({ cancel: () => { cancel(); reject(new Error('Upload cancelled')); }, on: (_: string, next: typeof update, failure: typeof reject) => { update = next; reject = failure; } });
    state.call.mockResolvedValueOnce(receipt).mockRejectedValueOnce({ details: { reason: 'upload-required' } });
    const progress = vi.fn(); const pending = client().stageCapture({ ...input, onProgress: progress });
    await vi.waitFor(() => expect(state.upload).toHaveBeenCalledOnce());
    switchTo('bob'); update({ totalBytes: 20, bytesTransferred: 10 });
    await expect(pending).rejects.toThrow('account changed');
    expect(cancel).toHaveBeenCalled(); expect(progress).not.toHaveBeenCalled(); expect(state.call).toHaveBeenCalledTimes(2); expect(state.listeners.size).toBe(0);
  });
  it('preserves valid transfer, immutable bytes/tags, cleanup and a fresh later account', async () => {
    const bytes = new Uint8Array(20); bytes[0] = 8;
    const tags = ['original']; const phases: string[] = [];
    state.upload.mockReturnValue({ cancel: vi.fn(), on: (_: string, progress: (snapshot: unknown) => void, _error: unknown, done: () => void) => { progress({ totalBytes: 20, bytesTransferred: 20 }); done(); } });
    state.call.mockResolvedValueOnce(receipt).mockRejectedValueOnce({ details: { reason: 'upload-required' } }).mockResolvedValueOnce({ ...receipt, status: 'ready' });
    const sdk = client();
    await expect(sdk.stageCapture({ ...input, media: bytes, tags, onPhase: phase => { phases.push(phase); if (phase === 'preparing') { bytes[0] = 99; tags[0] = 'changed'; } } })).resolves.toMatchObject({ status: 'ready' });
    expect(state.call.mock.calls[0][1]).toMatchObject({ expectedOwnerUid: 'alice', tags: ['original'] });
    expect(state.upload.mock.calls[0][1][0]).toBe(8);
    expect(phases).toEqual(['preparing', 'verifying', 'uploading', 'verifying', 'ready']); expect(state.listeners.size).toBe(0);
    switchTo('bob'); state.call.mockResolvedValueOnce({ ...receipt, status: 'ready' });
    await sdk.getCapture(id); expect(state.call).toHaveBeenLastCalledWith('getGameCapture', { captureId: id, expectedOwnerUid: 'bob' });
    expect(state.listeners.size).toBe(0);
  });
  it('keeps concurrent operation observers independent', async () => {
    let finish!: (value: unknown) => void;
    state.call.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(receipt);
    const sdk = client(), pending = sdk.getCapture(id);
    await sdk.getCapture(id); expect(state.listeners.size).toBe(1);
    switchTo('bob'); finish(receipt); await expect(pending).rejects.toThrow('account changed'); expect(state.listeners.size).toBe(0);
  });
  it('cleans up on network failure and permits retry for the same account', async () => {
    state.call.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(receipt);
    const sdk = client(); await expect(sdk.getCapture(id)).rejects.toThrow('Network unavailable'); expect(state.listeners.size).toBe(0);
    await expect(sdk.getCapture(id)).resolves.toEqual(receipt); expect(state.listeners.size).toBe(0);
  });
});
