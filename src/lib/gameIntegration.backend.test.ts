// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(), rateAllowed: true,
  metadata: vi.fn(), download: vi.fn(), remove: vi.fn(),
  afterRead: null as ((path: string) => void) | null,
}));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const reference = (path: string) => ({
    path,
    get: async () => { const value = structuredClone(state.rows.get(path)); return { id: path.split('/').at(-1)!, exists: value !== undefined, data: () => value }; },
    update: async (data: Record<string, unknown>) => { state.rows.set(path, { ...state.rows.get(path), ...data }); },
  });
  const collection = (name: string) => ({
    doc: (id: string) => reference(`${name}/${id}`),
    where: (field: string, _operator: string, value: unknown) => ({ limit: (max: number) => ({ get: async () => {
      const docs = await Promise.all([...state.rows.entries()].filter(([path, row]) => path.startsWith(`${name}/`) && row[field] === value)
        .slice(0, max).map(([path]) => reference(path).get()));
      return { docs, size: docs.length, empty: docs.length === 0 };
    } }) }),
  });
  const db = {
    collection,
    runTransaction: async (fn: (tx: unknown) => unknown) => {
      // Model atomic writes and optimistic read conflicts, including missing docs.
      // A callback that throws must not commit its reconciliation writes.
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, string | undefined>();
        const queryReads: Array<() => Promise<boolean>> = [];
        const writes: Array<() => void> = [];
        const result = await fn({
          get: async (ref: { path?: string; get: () => Promise<unknown> }) => {
            const snapshot = await ref.get();
            if ('data' in (snapshot as object)) {
              reads.set(ref.path!, JSON.stringify((snapshot as { data: () => unknown }).data()));
              state.afterRead?.(ref.path!);
            } else {
              const serialize = (value: unknown) => JSON.stringify((value as { docs: Array<{ id: string; data: () => unknown }> }).docs.map(doc => [doc.id, doc.data()]));
              const before = serialize(snapshot);
              queryReads.push(async () => serialize(await ref.get()) === before);
            }
            return snapshot;
          },
          create: (ref: ReturnType<typeof reference>, data: Record<string, unknown>) => {
            writes.push(() => { if (state.rows.has(ref.path)) throw new Error('exists'); state.rows.set(ref.path, { ...data }); });
          },
          set: (ref: ReturnType<typeof reference>, data: Record<string, unknown>) => { writes.push(() => { state.rows.set(ref.path, { ...data }); }); },
          update: (ref: ReturnType<typeof reference>, data: Record<string, unknown>) => {
            writes.push(() => { state.rows.set(ref.path, { ...state.rows.get(ref.path), ...data }); });
          },
        });
        const queriesValid = (await Promise.all(queryReads.map(check => check()))).every(Boolean);
        if (!queriesValid || [...reads].some(([path, before]) => JSON.stringify(state.rows.get(path)) !== before)) continue;
        writes.forEach(write => write());
        return result;
      }
      throw new Error('Transaction contention');
    },
  };
  return {
    db,
    requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw new Error('Sign in required'); return request.auth.uid; },
    rateLimit: async () => state.rateAllowed,
    enforceRateLimit: (allowed: boolean) => { if (!allowed) throw new Error('Rate limit exceeded'); },
  };
});
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/storage/index.js', () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ getMetadata: state.metadata, download: state.download, delete: state.remove }) }) }),
}));

import { completeGameCapture, createGameCapture, discardGameCapture, finishGameCapture, getGameCapture } from '../../functions/src/gameIntegration';
import { postSourceFingerprint } from '../../functions/src/_shared/postPublicationProof';

function publish(captureId: string, profileId = 'player') {
  const id = `game_${captureId}`, row = { author_id: profileId, game_capture_id: captureId };
  state.rows.set(`profiles/${profileId}`, { user_id: 'player' });
  state.rows.set(`posts/${id}`, row);
  state.rows.set(`_post_publications/${id}`, { version: 1, post_id: id, owner_uid: 'player', profile_id: profileId,
    status: 'published', revision: 'a'.repeat(48), source_fingerprint: postSourceFingerprint(row) });
}

const input = { gameId: 'neon-rally', idempotencyKey: 'unique-capture-key', contentType: 'image/png', byteSize: 100 };
const request = (data: unknown, uid = 'player') => ({ data, auth: { uid, token: {} }, rawRequest: {} });
// run() is Firebase's callable test entry point; no live services are contacted.
const create = (data: unknown = input, uid = 'player') => createGameCapture.run(request(data, uid) as Parameters<typeof createGameCapture.run>[0]);

beforeEach(() => {
  state.rows.clear(); state.rateAllowed = true; state.afterRead = null; vi.clearAllMocks();
  state.rows.set('game_integrations/neon-rally', { enabled: true, display_name: 'Neon Rally' });
  state.metadata.mockResolvedValue([{ size: '100', contentType: 'image/png', generation: '1' }]);
  state.download.mockResolvedValue([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]);
});

describe('game capture callable security', () => {
  it('requires authentication', async () => {
    await expect(createGameCapture.run({ data: input } as Parameters<typeof createGameCapture.run>[0])).rejects.toThrow('Sign in');
  });
  it('requires an enabled registered game', async () => {
    state.rows.clear(); await expect(create()).rejects.toThrow('not enabled');
  });
  it('does not allocate multiple drafts or quota for idempotent retries', async () => {
    const first = await create(); const again = await create();
    expect(again.captureId).toBe(first.captureId);
    const quotas = [...state.rows.entries()].filter(([key]) => key.startsWith('_rate_limits'));
    expect(quotas).toHaveLength(1); expect(quotas[0][1].count).toBe(1);
  });
  it('rejects a changed request using the same upload key', async () => {
    await create(); await expect(create({ ...input, caption: 'Different' })).rejects.toThrow('different capture');
  });
  it('does not allow another user to read or finish a capture', async () => {
    const capture = await create();
    await expect(getGameCapture.run(request({ captureId: capture.captureId }, 'stranger') as Parameters<typeof getGameCapture.run>[0])).rejects.toThrow('not found');
    await expect(finishGameCapture.run(request({ captureId: capture.captureId }, 'stranger') as Parameters<typeof finishGameCapture.run>[0])).rejects.toThrow('not found');
    expect(state.metadata).not.toHaveBeenCalled();
  });
  it('enforces the per-account daily count and media budget', async () => {
    await create();
    const quota = [...state.rows.keys()].find(key => key.startsWith('_rate_limits'))!;
    state.rows.get(quota)!.count = 20;
    await expect(create({ ...input, idempotencyKey: 'next-capture-key' })).rejects.toThrow('limit');
    state.rows.get(quota)!.count = 1; state.rows.get(quota)!.bytes = 200 * 1024 * 1024;
    await expect(create({ ...input, idempotencyKey: 'next-capture-key' })).rejects.toThrow('limit');
  });
  it('enforces expired drafts and per-minute API throttling', async () => {
    const capture = await create(); state.rows.get(`game_captures/${capture.captureId}`)!.expires_at_ms = 0;
    await expect(create()).rejects.toThrow('expired');
    state.rateAllowed = false; await expect(create()).rejects.toThrow('Rate limit');
  });
  it('requires exact storage size and media type', async () => {
    const capture = await create(); state.metadata.mockResolvedValue([{ size: '101', contentType: 'image/png', generation: '1' }]);
    await expect(finishGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof finishGameCapture.run>[0])).rejects.toThrow('does not match');
  });
  it('returns a specific resume code when upload has not arrived', async () => {
    const capture = await create(); state.metadata.mockRejectedValue({ code: 404 });
    await expect(finishGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof finishGameCapture.run>[0])).rejects.toMatchObject({ details: { reason: 'upload-required' } });
  });
  it('verifies file bytes then returns a ready draft without creating a post', async () => {
    const capture = await create();
    const ready = await finishGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof finishGameCapture.run>[0]);
    expect(ready.status).toBe('ready');
    expect([...state.rows.keys()].some(key => key.startsWith('posts/'))).toBe(false);
  });
  it('rejects a forged completion pointing to someone else’s post', async () => {
    const capture = await create(); state.rows.get(`game_captures/${capture.captureId}`)!.status = 'ready';
    const postId = `game_${capture.captureId}`;
    state.rows.set(`posts/${postId}`, { author_id: 'other-profile', game_capture_id: capture.captureId }); state.rows.set('profiles/other-profile', { user_id: 'stranger' });
    await expect(completeGameCapture.run(request({ captureId: capture.captureId, postId }) as Parameters<typeof completeGameCapture.run>[0])).rejects.toThrow('does not belong');
  });
  it('recovers a published post after a lost completion acknowledgement', async () => {
    const capture = await create(); state.rows.get(`game_captures/${capture.captureId}`)!.status = 'ready';
    const postId = `game_${capture.captureId}`;
    publish(capture.captureId, 'my-profile');
    const recovered = await getGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof getGameCapture.run>[0]);
    expect(recovered.status).toBe('imported'); expect(recovered.postId).toBe(postId);
  });
  it('does not attest a legacy row that merely claims the capture owner', async () => {
    const capture = await create();
    state.rows.get(`game_captures/${capture.captureId}`)!.status = 'ready';
    state.rows.set('profiles/player', { user_id: 'player' });
    state.rows.set(`posts/game_${capture.captureId}`, { author_id: 'player', game_capture_id: capture.captureId });
    const current = await getGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof getGameCapture.run>[0]);
    expect(current.status).toBe('ready');
    expect(current.postId).toBeNull();
    expect(state.rows.has(`_post_publications/game_${capture.captureId}`)).toBe(false);
  });
  it('commits the imported receipt before refusing to discard an unacknowledged live post', async () => {
    const capture = await create(); const capturePath = `game_captures/${capture.captureId}`;
    state.rows.get(capturePath)!.status = 'ready';
    const postId = `game_${capture.captureId}`;
    publish(capture.captureId, 'my-profile');
    await expect(discardGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof discardGameCapture.run>[0])).rejects.toThrow('already published');
    expect(state.rows.get(capturePath)).toMatchObject({ status: 'imported', post_id: postId });
    const acknowledged = await completeGameCapture.run(request({ captureId: capture.captureId, postId }) as Parameters<typeof completeGameCapture.run>[0]);
    expect(acknowledged.status).toBe('imported');
  });
  it('retries discard if a publish commits after its missing-post read', async () => {
    const capture = await create(); const capturePath = `game_captures/${capture.captureId}`;
    state.rows.get(capturePath)!.status = 'ready';
    const postId = `game_${capture.captureId}`;
    state.afterRead = path => {
      if (path !== `posts/${postId}`) return;
      state.afterRead = null;
      publish(capture.captureId);
    };
    await expect(discardGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof discardGameCapture.run>[0])).rejects.toThrow('already published');
    expect(state.rows.get(capturePath)).toMatchObject({ status: 'imported', post_id: postId });
  });
  it('does not return a stale ready receipt when discard commits during a read', async () => {
    const capture = await create(); const capturePath = `game_captures/${capture.captureId}`;
    state.rows.get(capturePath)!.status = 'ready';
    state.afterRead = path => {
      if (path !== capturePath) return;
      state.afterRead = null;
      state.rows.get(capturePath)!.status = 'cancelled';
    };
    await expect(getGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof getGameCapture.run>[0])).rejects.toThrow('discarded');
    expect(state.rows.get(capturePath)!.status).toBe('cancelled');
  });
  it('does not overwrite a changed capture from stale reconciliation reads', async () => {
    const capture = await create(); const capturePath = `game_captures/${capture.captureId}`;
    state.rows.get(capturePath)!.status = 'ready';
    const postId = `game_${capture.captureId}`;
    publish(capture.captureId);
    state.afterRead = path => {
      if (path !== `posts/${postId}`) return;
      state.afterRead = null;
      state.rows.get(capturePath)!.status = 'cancelled';
    };
    await expect(getGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof getGameCapture.run>[0])).rejects.toThrow('discarded');
    expect(state.rows.get(capturePath)!.status).toBe('cancelled');
    expect(state.rows.get(capturePath)!.post_id).toBeUndefined();
  });
  it('cancels an unpublished capture and refuses a different account’s discard', async () => {
    const capture = await create();
    await expect(discardGameCapture.run(request({ captureId: capture.captureId }, 'stranger') as Parameters<typeof discardGameCapture.run>[0])).rejects.toThrow('not found');
    await expect(discardGameCapture.run(request({ captureId: capture.captureId }) as Parameters<typeof discardGameCapture.run>[0])).resolves.toEqual({ ok: true });
    expect(state.rows.get(`game_captures/${capture.captureId}`)!.status).toBe('cancelled');
  });
});
