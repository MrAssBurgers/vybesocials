import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), writes: 0, pending: Promise.resolve() as Promise<unknown> }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => {
  const snapshot = (id: string) => ({ exists: () => state.rows.has(id), data: () => state.rows.get(id) });
  return {
    doc: (_db: unknown, _collection: string, id: string) => ({ id }),
    getDocFromServer: async (ref: { id: string }) => snapshot(ref.id),
    runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) => {
      // Model Firestore's serializable successful transaction attempts.
      const result = state.pending.then(() => callback({
        get: async (ref: { id: string }) => snapshot(ref.id),
        set: (ref: { id: string }, data: Record<string, unknown>) => { state.rows.set(ref.id, data); state.writes++; },
      }));
      state.pending = result.catch(() => undefined);
      return result;
    },
  };
});
import { findGameCapturePost, saveGameCapturePost } from './gameCapturePost';
const captureId = 'a'.repeat(48);
beforeEach(() => { state.rows.clear(); state.writes = 0; state.pending = Promise.resolve(); });
describe('transactional game capture import', () => {
  it('makes simultaneous tabs resolve to one post and preserves the first caption', async () => {
    const [first, second] = await Promise.all([
      saveGameCapturePost(captureId, 'author', { caption: 'First', media_url: 'media:first' }),
      saveGameCapturePost(captureId, 'author', { caption: 'Second', media_url: 'media:second' }),
    ]);
    expect(first.created).toBe(true); expect(second.created).toBe(false);
    expect(second.post).toEqual(first.post); expect(second.post.caption).toBe('First'); expect(state.writes).toBe(1);
  });
  it('recovers an existing post on a retry before uploading media again', async () => {
    const { post } = await saveGameCapturePost(captureId, 'author', { caption: 'First' });
    expect(await findGameCapturePost(captureId, 'author')).toEqual(post);
    expect(state.writes).toBe(1);
  });
  it('refuses another author’s existing document without overwriting it', async () => {
    const { post } = await saveGameCapturePost(captureId, 'author', { caption: 'Original' });
    await expect(saveGameCapturePost(captureId, 'stranger', { caption: 'Hijack' })).rejects.toThrow('another author');
    await expect(findGameCapturePost(captureId, 'stranger')).rejects.toThrow('another author');
    expect(state.rows.get(post.id)?.caption).toBe('Original'); expect(state.writes).toBe(1);
  });
  it('refuses a document with a mismatched capture reference', async () => {
    state.rows.set(`game_${captureId}`, { author_id: 'author', game_capture_id: 'b'.repeat(48) });
    await expect(saveGameCapturePost(captureId, 'author', {})).rejects.toThrow();
    expect(state.writes).toBe(0);
  });
  it('cannot accept an arbitrary post ID or traversal path', async () => {
    await expect(saveGameCapturePost('../other-post', 'author', {})).rejects.toThrow('Invalid');
    expect(state.writes).toBe(0);
  });
});
