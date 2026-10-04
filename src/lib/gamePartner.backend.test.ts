// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  rows: new Map<string, Row>(), objects: new Map<string, { bytes: Buffer; metadata: Row }>(),
  rate: true, generation: 0, afterRead: null as ((path: string) => void) | null,
  afterSave: null as (() => void) | null, afterFinalSave: null as (() => void) | null,
  afterDownload: null as (() => void) | null,
}));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const reference = (path: string) => ({
    path, id: path.split('/').at(-1),
    get: async () => { const data = structuredClone(state.rows.get(path)); return { data: () => data }; },
    update: async (value: Row) => { state.rows.set(path, { ...state.rows.get(path), ...value }); },
    delete: async () => { state.rows.delete(path); },
  });
  const update = (path: string, patch: Row) => {
    const next = structuredClone(state.rows.get(path) ?? {});
    for (const [key, value] of Object.entries(patch)) {
      const [outer, inner] = key.split('.');
      if (inner) next[outer] = { ...(next[outer] as Row), [inner]: value };
      else next[key] = value;
    }
    state.rows.set(path, next);
  };
  const collection = (name: string) => ({
    doc: (id: string) => reference(`${name}/${id}`),
    where: (field: string, operator: string, value: unknown) => ({ limit: (max: number) => ({ get: async () => {
      const docs = [...state.rows.entries()].filter(([path, row]) => path.startsWith(`${name}/`) && (operator === '==' ? row[field] === value : Number(row[field]) <= Number(value)))
        .slice(0, max).map(([path, row]) => ({ id: path.split('/').at(-1)!, ref: reference(path), data: () => structuredClone(row) }));
      return { docs, empty: docs.length === 0 };
    } }) }),
  });
  return {
    requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw new Error('Sign in required'); return request.auth.uid; },
    rateLimit: async () => state.rate,
    enforceRateLimit: (allowed: boolean) => { if (!allowed) throw new Error('Rate limit exceeded'); },
    db: {
      collection,
      batch: () => { const deletes: string[] = []; return { delete: (ref: ReturnType<typeof reference>) => deletes.push(ref.path), commit: async () => deletes.forEach(path => state.rows.delete(path)) }; },
      runTransaction: async (fn: (tx: unknown) => unknown) => {
        for (let attempt = 0; attempt < 8; attempt++) {
          const reads = new Map<string, string | undefined>(); const writes: Array<() => void> = [];
          const result = await fn({
            get: async (ref: ReturnType<typeof reference>) => {
              if (writes.length) throw new Error('Firestore transaction read after write');
              const snapshot = await ref.get(); reads.set(ref.path, JSON.stringify(snapshot.data())); state.afterRead?.(ref.path); return snapshot;
            },
            create: (ref: ReturnType<typeof reference>, value: Row) => writes.push(() => { if (state.rows.has(ref.path)) throw new Error('exists'); state.rows.set(ref.path, structuredClone(value)); }),
            set: (ref: ReturnType<typeof reference>, value: Row) => writes.push(() => state.rows.set(ref.path, structuredClone(value))),
            update: (ref: ReturnType<typeof reference>, value: Row) => writes.push(() => update(ref.path, value)),
          });
          if ([...reads].some(([path, value]) => JSON.stringify(state.rows.get(path)) !== value)) continue;
          writes.forEach(write => write()); return result;
        }
        throw new Error('Transaction contention');
      },
    },
  };
});
vi.mock('../../functions/node_modules/firebase-admin/lib/esm/storage/index.js', () => {
  const file = (path: string, options?: { generation?: string }) => ({
    name: path, generation: options?.generation, metadata: {} as Row,
    save: async (bytes: Buffer, options: { preconditionOpts?: { ifGenerationMatch?: number }; metadata: Row }) => {
      if (options.preconditionOpts?.ifGenerationMatch !== 0) throw new Error('Missing immutable storage precondition');
      if (state.objects.has(path)) throw { code: 412 };
      state.objects.set(path, { bytes: Buffer.from(bytes), metadata: { ...options.metadata, size: String(bytes.length), generation: String(++state.generation) } });
      state.afterSave?.();
      if (path.startsWith('game-captures/')) state.afterFinalSave?.();
    },
    getMetadata: async () => { const stored = state.objects.get(path); if (!stored) throw { code: 404 }; return [stored.metadata]; },
    download: async () => {
      const stored = state.objects.get(path); if (!stored) throw { code: 404 };
      if (options?.generation && stored.metadata.generation !== options.generation) throw { code: 412 };
      state.afterDownload?.();
      return [Buffer.from(stored.bytes)];
    },
    delete: async () => { state.objects.delete(path); },
  });
  return { getStorage: () => ({ bucket: () => ({ file,
    combine: async (sources: ReturnType<typeof file>[], destination: ReturnType<typeof file>, options: { ifGenerationMatch: number }) => {
      if (options.ifGenerationMatch !== 0) throw new Error('Missing compose precondition');
      if (state.objects.has(destination.name)) throw { code: 412 };
      const buffers = await Promise.all(sources.map(async source => (await source.download())[0]));
      const bytes = Buffer.concat(buffers);
      state.objects.set(destination.name, { bytes, metadata: { contentType: destination.metadata.contentType, size: String(bytes.length), generation: String(++state.generation) } });
      state.afterFinalSave?.(); return [destination];
    },
  }) }) };
});

import { authorizePartner, exchangePartnerDevice, startPartnerDevice, PARTNER_CHUNK_BYTES } from '../../functions/src/_shared/gamePartnerCore';
import { approveGamePartnerLink, denyGamePartnerLink, getGamePartnerLink, listGamePartnerConnections, revokeGamePartnerConnection, cleanupGamePartnerData } from '../../functions/src/gamePartnerAuth';
import { createPartnerCapture, discardPartnerCapture, finishPartnerCapture, getPartnerCapture, putPartnerChunk, revokePartnerToken } from '../../functions/src/_shared/gamePartnerUploads';
import { createGameCapture } from '../../functions/src/gameIntegration';
import { db } from '../../functions/src/_shared/admin';
import { handleGamePartnerRequest } from '../../functions/src/gamePartnerApi';
import { readPartnerCapturePreview, checkPartnerCapturePreview } from '../../functions/src/_shared/gamePartnerPreview';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const request = (data: unknown, uid = 'player') => ({ data, auth: { uid, token: {} }, rawRequest: {} });
const approve = (userCode: string, uid = 'player') => approveGamePartnerLink.run(request({ userCode }, uid) as Parameters<typeof approveGamePartnerLink.run>[0]);
const lookup = (userCode: string, uid = 'player') => getGamePartnerLink.run(request({ userCode }, uid) as Parameters<typeof getGamePartnerLink.run>[0]);
const game = { enabled: true, partner_enabled: true, publisher_verified: true, display_name: 'Neon Rally', publisher_name: 'Verified Studio' };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const input = (bytes = png, key = 'unique-capture-key') => ({ idempotencyKey: key, contentType: 'image/png', byteSize: bytes.length, contentSha256: sha(bytes), caption: 'A game moment' });
const authorize = (token: string) => db.runTransaction(tx => authorizePartner(tx, token, 'capture:write'));
async function linked(clientId = 'neon-rally', uid = 'player') {
  const device = await startPartnerDevice(clientId, 'test-ip'); const connection = await approve(device.userCode, uid);
  vi.setSystemTime(Date.now() + 5000);
  const token = await exchangePartnerDevice(clientId, device.deviceCode, 'test-ip');
  return { device, connection, ...token };
}
async function uploaded() {
  const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
  await putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png));
  return { ...access, capture };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  state.rows.clear(); state.objects.clear(); state.rate = true; state.generation = 0;
  state.afterRead = null; state.afterSave = null; state.afterFinalSave = null;
  state.afterDownload = null;
  state.rows.set('game_integrations/neon-rally', { ...game });
  state.rows.set('game_integrations/another-game', { ...game });
});
afterEach(() => vi.useRealTimers());

describe('partner capture preview authority', () => {
  const scopes = ['capture:write', 'capture:status', 'capture:preview'];
  async function previewReady() {
    const device = await startPartnerDevice('neon-rally', 'ip', scopes);
    const connection = await approveGamePartnerLink.run(request({ userCode: device.userCode, approvedScopes: scopes }) as Parameters<typeof approveGamePartnerLink.run>[0]);
    vi.setSystemTime(Date.now() + 5000);
    const access = await exchangePartnerDevice('neon-rally', device.deviceCode, 'ip');
    const capture = await createPartnerCapture(access.accessToken, input());
    await putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png));
    await finishPartnerCapture(access.accessToken, capture.captureId);
    return { ...access, connection, capture };
  }
  it('requires the updated consent to acknowledge the requested media scope', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip', scopes);
    expect((await lookup(device.userCode)).scopes).toEqual(scopes);
    await expect(approve(device.userCode)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect([...state.rows.keys()].filter(key => key.startsWith('game_partner_connections/'))).toEqual([]);
    await expect(startPartnerDevice('neon-rally', 'ip', [...scopes, 'feed:read'])).rejects.toMatchObject({ code: 'invalid_request' });
  });
  it('returns verified bytes only to the media-approved original connection', async () => {
    const a = await previewReady();
    expect(a.scopes).toEqual(scopes);
    expect(await readPartnerCapturePreview(a.accessToken, a.capture.captureId)).toMatchObject({ bytes: png, contentType: 'image/png', offset: 0, total: png.length, sha256: sha(png) });
    await expect(checkPartnerCapturePreview(a.accessToken, a.capture.captureId)).resolves.toBeUndefined();
    const b = await linked();
    await expect(readPartnerCapturePreview(b.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'insufficient_scope' });
    state.rows.get(`game_partner_tokens/${sha(b.accessToken)}`)!.scopes = scopes;
    state.rows.get(`game_partner_connections/${b.connectionId}`)!.scopes = scopes;
    await expect(readPartnerCapturePreview(b.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
  });
  it.each(['owner_uid', 'game_id', 'partner_connection_id', 'storage_path', 'content_sha256', 'content_type'])('rejects altered %s before exposing bytes', async field => {
    const a = await previewReady(); state.rows.get(`game_captures/${a.capture.captureId}`)![field] = 'different';
    await expect(readPartnerCapturePreview(a.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
  });
  it.each(['cancelled', 'expired', 'uploading', 'imported'])('does not preview a %s capture', async status => {
    const a = await previewReady(); state.rows.get(`game_captures/${a.capture.captureId}`)!.status = status;
    await expect(readPartnerCapturePreview(a.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('checks the live connection again after bytes arrive', async () => {
    const a = await previewReady();
    state.afterDownload = () => { state.rows.get(`game_partner_connections/${a.connectionId}`)!.status = 'revoked'; };
    await expect(readPartnerCapturePreview(a.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'invalid_token' });
  });
  it('rejects altered bytes and captures already committed to a post', async () => {
    const a = await previewReady(); const capture = state.rows.get(`game_captures/${a.capture.captureId}`)!;
    const stored = state.objects.get(String(capture.storage_path))!; stored.bytes[11] ^= 1;
    await expect(readPartnerCapturePreview(a.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
    stored.bytes[11] ^= 1;
    state.rows.set(`posts/game_${a.capture.captureId}`, { game_capture_id: a.capture.captureId, author_id: 'player' });
    await expect(checkPartnerCapturePreview(a.accessToken, a.capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('partner device consent and scoped authorization', () => {
  it('stores only hashes of random credentials and no Firebase token or UID in device responses', async () => {
    const access = await linked();
    expect(access.device.deviceCode).toMatch(/^vyd_[A-Za-z0-9_-]{43}$/);
    expect(access.accessToken).toMatch(/^vyp_[A-Za-z0-9_-]{43}$/);
    const serialized = JSON.stringify([...state.rows]);
    expect(serialized).not.toContain(access.device.deviceCode); expect(serialized).not.toContain(access.accessToken);
    expect(serialized).not.toContain(access.device.userCode.replace('-', ''));
    expect(access.scopes).toEqual(['capture:write', 'capture:status']);
    expect(access.expiresIn).toBeLessThanOrEqual(600);
  });
  it('requires manual verified and enabled partner registration', async () => {
    for (const field of ['enabled', 'partner_enabled', 'publisher_verified']) {
      state.rows.set('game_integrations/neon-rally', { ...game, [field]: false });
      await expect(startPartnerDevice('neon-rally', 'ip')).rejects.toMatchObject({ code: 'access_denied' });
    }
  });
  it('persists slow_down intervals and pending polling state', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip');
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'slow_down', retryAfter: 10 });
    vi.setSystemTime(Date.now() + 10000);
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'authorization_pending', retryAfter: 10 });
    expect([...state.rows.values()].some(row => row.interval_ms === 10000)).toBe(true);
  });
  it('does not grant access from lookup alone, unauthenticated approval, or another client', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip');
    expect((await lookup(device.userCode.toLowerCase())).status).toBe('pending');
    expect([...state.rows.keys()].filter(key => key.startsWith('game_partner_connections/'))).toHaveLength(0);
    await expect(approveGamePartnerLink.run({ data: { userCode: device.userCode } } as Parameters<typeof approveGamePartnerLink.run>[0])).rejects.toThrow('Sign in');
    await expect(exchangePartnerDevice('another-game', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'invalid_grant' });
  });
  it('binds approved consent to the first account even in an approval race', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip');
    const results = await Promise.allSettled([approve(device.userCode), approve(device.userCode, 'stranger')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect([...state.rows.keys()].filter(key => key.startsWith('game_partner_connections/'))).toHaveLength(1);
    await expect(lookup(device.userCode, 'stranger')).rejects.toMatchObject({ code: 'not-found' });
  });
  it('exchanges only once under concurrent polling and rejects replay', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip'); await approve(device.userCode);
    vi.setSystemTime(Date.now() + 5000);
    const results = await Promise.allSettled([exchangePartnerDevice('neon-rally', device.deviceCode, 'ip'), exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect([...state.rows.keys()].filter(key => key.startsWith('game_partner_tokens/'))).toHaveLength(1);
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'invalid_grant' });
  });
  it('honors explicit denial and device expiry', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip');
    await denyGamePartnerLink.run(request({ userCode: device.userCode }) as Parameters<typeof denyGamePartnerLink.run>[0]);
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'access_denied' });
    vi.setSystemTime(Date.now() + 600001);
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'expired_token' });
    await expect(approve(device.userCode)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects expired, revoked, unregistered, and wrong-scope tokens on every request', async () => {
    const access = await linked(); await expect(authorize(access.accessToken)).resolves.toMatchObject({ uid: 'player' });
    state.rows.get(`game_partner_tokens/${sha(access.accessToken)}`)!.scopes = ['capture:status'];
    await expect(authorize(access.accessToken)).rejects.toMatchObject({ code: 'insufficient_scope' });
    state.rows.get(`game_partner_tokens/${sha(access.accessToken)}`)!.scopes = ['capture:write', 'capture:status'];
    state.rows.get('game_integrations/neon-rally')!.partner_enabled = false;
    await expect(authorize(access.accessToken)).rejects.toMatchObject({ code: 'access_denied' });
    state.rows.get('game_integrations/neon-rally')!.partner_enabled = true;
    vi.setSystemTime(access.expiresAt);
    await expect(authorize(access.accessToken)).rejects.toMatchObject({ code: 'invalid_token' });
  });
  it('lists only account-owned connections and prevents cross-account revocation', async () => {
    const access = await linked(); await linked('another-game', 'stranger');
    const list = await listGamePartnerConnections.run(request({}) as Parameters<typeof listGamePartnerConnections.run>[0]);
    expect(list.connections).toHaveLength(1); expect(list.connections[0].connectionId).toBe(access.connectionId);
    await expect(revokeGamePartnerConnection.run(request({ connectionId: access.connectionId }, 'stranger') as Parameters<typeof revokeGamePartnerConnection.run>[0])).rejects.toMatchObject({ code: 'not-found' });
    await revokeGamePartnerConnection.run(request({ connectionId: access.connectionId }) as Parameters<typeof revokeGamePartnerConnection.run>[0]);
    await expect(authorize(access.accessToken)).rejects.toMatchObject({ code: 'invalid_token' });
  });
  it('rejects consent exchange if revocation races the transaction', async () => {
    const device = await startPartnerDevice('neon-rally', 'ip'); const connection = await approve(device.userCode);
    vi.setSystemTime(Date.now() + 5000);
    state.afterRead = path => { if (path === `game_partner_connections/${connection.connectionId}`) { state.afterRead = null; state.rows.get(path)!.status = 'revoked'; } };
    await expect(exchangePartnerDevice('neon-rally', device.deviceCode, 'ip')).rejects.toMatchObject({ code: 'access_denied' });
    expect([...state.rows.keys()].filter(key => key.startsWith('game_partner_tokens/'))).toHaveLength(0);
  });
  it('enforces API and consent throttling', async () => {
    state.rate = false;
    await expect(startPartnerDevice('neon-rally', 'ip')).rejects.toMatchObject({ status: 429 });
    await expect(lookup('ABCD-EFGH')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('partner immutable private upload lifecycle', () => {
  it('deduplicates capture reservations and binds retry keys to the complete file checksum', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    expect(await createPartnerCapture(access.accessToken, input())).toEqual(capture);
    expect(capture).not.toHaveProperty('storagePath'); expect(JSON.stringify(capture)).not.toContain('player');
    expect(state.rows.get(`_rate_limits/game_capture_quota_${sha('player')}`)!.count).toBe(1);
    await expect(createPartnerCapture(access.accessToken, { ...input(), contentSha256: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('shares daily account count and byte quotas with the original Firebase SDK', async () => {
    const access = await linked(); await createPartnerCapture(access.accessToken, input());
    const quota = state.rows.get(`_rate_limits/game_capture_quota_${sha('player')}`)!;
    quota.count = 20;
    await expect(createPartnerCapture(access.accessToken, input(png, 'new-capture-key'))).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(createGameCapture.run(request({ ...input(), gameId: 'neon-rally' }) as Parameters<typeof createGameCapture.run>[0])).rejects.toMatchObject({ code: 'resource-exhausted' });
    quota.count = 1; quota.bytes = 200 * 1024 * 1024;
    await expect(createPartnerCapture(access.accessToken, input(png, 'new-capture-key'))).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('enforces the global pilot capture cap without charging idempotent retries', async () => {
    const access = await linked(); const first = await createPartnerCapture(access.accessToken, input());
    const quota = state.rows.get('_rate_limits/game_partner_capture_global')!;
    expect(quota.count).toBe(1);
    quota.count = 1000;
    expect(await createPartnerCapture(access.accessToken, input())).toEqual(first);
    await expect(createPartnerCapture(access.accessToken, input(png, 'second-capture-key'))).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(state.rows.get(`_rate_limits/game_capture_quota_${sha('player')}`)!.count).toBe(1);
  });
  it('refuses other connections, owners, games, and explicit mismatched game IDs', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    for (const other of [await linked(), await linked('neon-rally', 'stranger'), await linked('another-game')]) {
      await expect(getPartnerCapture(other.accessToken, capture.captureId)).rejects.toMatchObject({ code: 'not_found' });
      await expect(putPartnerChunk(other.accessToken, capture.captureId, 0, png, sha(png))).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(createPartnerCapture(access.accessToken, { ...input(), gameId: 'another-game' })).rejects.toMatchObject({ code: 'access_denied' });
  });
  it('accepts exact immutable retries and rejects a same-size changed chunk', async () => {
    const { accessToken, capture } = await uploaded();
    await expect(putPartnerChunk(accessToken, capture.captureId, 0, png, sha(png))).resolves.toMatchObject({ index: 0, byteSize: png.length });
    const different = Buffer.from(png); different[11] = 1;
    await expect(putPartnerChunk(accessToken, capture.captureId, 0, different, sha(different))).rejects.toMatchObject({ code: 'conflict' });
    expect(state.objects.size).toBe(1);
  });
  it('detects a concurrent conflicting chunk before acknowledging its bytes', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    const different = Buffer.from(png); different[11] = 1;
    const results = await Promise.allSettled([putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png)), putPartnerChunk(access.accessToken, capture.captureId, 0, different, sha(different))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(state.objects.size).toBe(1);
  });
  it('recovers a saved chunk after a lost Firestore acknowledgement', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    state.afterSave = () => { state.afterSave = null; throw new Error('lost response'); };
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png))).rejects.toThrow('lost response');
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png))).resolves.toMatchObject({ sha256: sha(png) });
  });
  it('rejects incorrect checksum, chunk size/index and the 48MiB capture ceiling', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png, 'f'.repeat(64))).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 1, png, sha(png))).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png.subarray(0, 11), sha(png.subarray(0, 11)))).rejects.toMatchObject({ code: 'invalid_request' });
    const huge = Buffer.alloc(PARTNER_CHUNK_BYTES + 1);
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, huge, sha(huge))).rejects.toMatchObject({ code: 'payload_too_large' });
    await expect(createPartnerCapture(access.accessToken, { ...input(), byteSize: 48 * 1024 * 1024 + 1 })).rejects.toThrow('48 MiB');
  });
  it('checks revocation after storage write before acknowledging the chunk', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    state.afterSave = () => { state.rows.get(`game_partner_connections/${access.connectionId}`)!.status = 'revoked'; };
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png))).rejects.toMatchObject({ code: 'invalid_token' });
    expect(state.rows.get(`game_partner_uploads/${capture.captureId}`)!.chunks).toEqual({});
    expect(state.rows.get(`game_captures/${capture.captureId}`)!.status).toBe('uploading');
  });
  it('rejects a chunk acknowledgement if access expires during its storage write', async () => {
    const access = await linked(); const capture = await createPartnerCapture(access.accessToken, input());
    state.afterSave = () => { vi.setSystemTime(access.expiresAt); };
    await expect(putPartnerChunk(access.accessToken, capture.captureId, 0, png, sha(png))).rejects.toMatchObject({ code: 'invalid_token' });
    expect(state.rows.get(`game_partner_uploads/${capture.captureId}`)!.chunks).toEqual({});
  });
  it('verifies signature and complete hash before final storage writes', async () => {
    const access = await linked();
    const wrongType = Buffer.alloc(12, 1); const bad = await createPartnerCapture(access.accessToken, input(wrongType));
    await putPartnerChunk(access.accessToken, bad.captureId, 0, wrongType, sha(wrongType));
    await expect(finishPartnerCapture(access.accessToken, bad.captureId)).rejects.toMatchObject({ code: 'invalid_request' });
    const wrongHash = await createPartnerCapture(access.accessToken, { ...input(png, 'wrong-hash-key'), contentSha256: 'f'.repeat(64) });
    await putPartnerChunk(access.accessToken, wrongHash.captureId, 0, png, sha(png));
    await expect(finishPartnerCapture(access.accessToken, wrongHash.captureId)).rejects.toMatchObject({ code: 'conflict' });
    expect([...state.objects.keys()].some(path => path.startsWith('game-captures/'))).toBe(false);
  });
  it('finishes ordered chunks into a private review capture without publishing a post', async () => {
    const access = await linked(); const bytes = Buffer.alloc(PARTNER_CHUNK_BYTES + 12); png.copy(bytes);
    const capture = await createPartnerCapture(access.accessToken, input(bytes));
    const first = bytes.subarray(0, PARTNER_CHUNK_BYTES); const last = bytes.subarray(PARTNER_CHUNK_BYTES);
    await putPartnerChunk(access.accessToken, capture.captureId, 1, last, sha(last));
    await expect(finishPartnerCapture(access.accessToken, capture.captureId)).rejects.toMatchObject({ code: 'conflict' });
    await putPartnerChunk(access.accessToken, capture.captureId, 0, first, sha(first));
    const ready = await finishPartnerCapture(access.accessToken, capture.captureId);
    expect(ready.status).toBe('ready'); expect(ready).not.toHaveProperty('storagePath');
    expect([...state.rows.keys()].some(path => path.startsWith('posts/'))).toBe(false);
    expect(await finishPartnerCapture(access.accessToken, capture.captureId)).toEqual(ready);
  });
  it('does not make a completed capture ready after revocation during final storage write', async () => {
    const access = await uploaded();
    state.afterFinalSave = () => { state.rows.get(`game_partner_connections/${access.connectionId}`)!.status = 'revoked'; };
    await expect(finishPartnerCapture(access.accessToken, access.capture.captureId)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(state.rows.get(`game_captures/${access.capture.captureId}`)!.status).toBe('uploading');
  });
  it('does not resurrect a capture discarded during final storage write', async () => {
    const access = await uploaded();
    state.afterFinalSave = () => { state.rows.get(`game_captures/${access.capture.captureId}`)!.status = 'cancelled'; };
    await expect(finishPartnerCapture(access.accessToken, access.capture.captureId)).rejects.toMatchObject({ code: 'expired_capture' });
    expect(state.rows.get(`game_captures/${access.capture.captureId}`)!.status).toBe('cancelled');
  });
  it('keeps already ready captures when disconnected, but denies further partner access', async () => {
    const access = await uploaded(); await finishPartnerCapture(access.accessToken, access.capture.captureId);
    await revokePartnerToken(access.accessToken);
    await expect(getPartnerCapture(access.accessToken, access.capture.captureId)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(state.rows.get(`game_captures/${access.capture.captureId}`)!.status).toBe('ready');
  });
  it('refuses discard after a post committed and cancels an unpublished capture', async () => {
    const access = await uploaded();
    state.rows.set(`posts/game_${access.capture.captureId}`, { game_capture_id: access.capture.captureId, author_id: 'player' });
    await expect(discardPartnerCapture(access.accessToken, access.capture.captureId)).rejects.toMatchObject({ code: 'conflict' });
    expect(state.rows.get(`game_captures/${access.capture.captureId}`)!.status).toBe('imported');
    const another = await createPartnerCapture(access.accessToken, input(png, 'discard-other-key'));
    await expect(discardPartnerCapture(access.accessToken, another.captureId)).resolves.toEqual({ ok: true });
    await expect(discardPartnerCapture(access.accessToken, another.captureId)).resolves.toEqual({ ok: true });
    expect(state.rows.get(`game_captures/${another.captureId}`)!.status).toBe('cancelled');
  });
  it('recovers imported status through the partner API after the VYBE acknowledgement was lost', async () => {
    const access = await uploaded(); await finishPartnerCapture(access.accessToken, access.capture.captureId);
    state.rows.set(`posts/game_${access.capture.captureId}`, { game_capture_id: access.capture.captureId, author_id: 'migrated-profile' });
    state.rows.set('profiles/migrated-profile', { user_id: 'player' });
    const result = await getPartnerCapture(access.accessToken, access.capture.captureId);
    expect(result).toMatchObject({ status: 'imported', postId: `game_${access.capture.captureId}` });
    expect(result).not.toHaveProperty('storagePath');
  });
  it('retries a discard when the canonical post appears after a missing-post read', async () => {
    const access = await uploaded();
    const postPath = `posts/game_${access.capture.captureId}`;
    state.afterRead = path => {
      if (path !== postPath) return;
      state.afterRead = null;
      state.rows.set(path, { game_capture_id: access.capture.captureId, author_id: 'player' });
    };
    await expect(discardPartnerCapture(access.accessToken, access.capture.captureId)).rejects.toMatchObject({ code: 'conflict' });
    expect(state.rows.get(`game_captures/${access.capture.captureId}`)!.status).toBe('imported');
  });
  it('does not reconcile a forged canonical post belonging to another owner', async () => {
    const access = await uploaded(); await finishPartnerCapture(access.accessToken, access.capture.captureId);
    state.rows.set(`posts/game_${access.capture.captureId}`, { game_capture_id: access.capture.captureId, author_id: 'stranger' });
    expect((await getPartnerCapture(access.accessToken, access.capture.captureId)).status).toBe('ready');
  });
  it('cleans unacknowledged chunk objects and retains a tombstone for late writes', async () => {
    const access = await uploaded(); vi.setSystemTime(access.expiresAt + 120001);
    await cleanupGamePartnerData.run({} as Parameters<typeof cleanupGamePartnerData.run>[0]);
    expect(state.objects.size).toBe(0);
    expect(state.rows.get(`game_partner_uploads/${access.capture.captureId}`)!.status).toBe('expired');
    expect(state.rows.get(`game_partner_uploads/${access.capture.captureId}`)!.cleanup_at_ms).toBe(access.expiresAt + 86400000);
    vi.setSystemTime(Date.now() + 86400000);
    await cleanupGamePartnerData.run({} as Parameters<typeof cleanupGamePartnerData.run>[0]);
    expect(state.rows.has(`game_partner_uploads/${access.capture.captureId}`)).toBe(false);
    expect([...state.rows.keys()].filter(path => /^game_partner_(tokens|connections|devices|codes)\//.test(path))).toHaveLength(0);
  });
});

describe('partner HTTP transport', () => {
  async function http(path: string, method: string, token?: string, body: unknown = {}) {
    let status = 0; let result: unknown;
    const response = { set: vi.fn(), status: (value: number) => { status = value; return response; }, json: (value: unknown) => { result = value; }, end: vi.fn() };
    const req = { path, method, ip: 'ip', socket: {}, rawBody: Buffer.from(JSON.stringify(body)), body, is: (type: string) => type === 'application/json', get: (key: string) => key.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined };
    await handleGamePartnerRequest(req as Parameters<typeof handleGamePartnerRequest>[0], response as unknown as Parameters<typeof handleGamePartnerRequest>[1]);
    return { status, result, headers: response.set.mock.calls };
  }
  it('returns no-store structured auth errors and never echoes credentials', async () => {
    const token = 'vyp_' + 'a'.repeat(43);
    const result = await http('/v1/captures', 'POST', token);
    expect(result.status).toBe(401); expect(result.result).toMatchObject({ error: 'invalid_token' });
    expect(JSON.stringify(result)).not.toContain(token); expect(result.headers[0][0]).toMatchObject({ 'Cache-Control': 'private, no-store' });
  });
  it('returns private-path-free receipts through the real HTTP handler', async () => {
    const access = await linked(); const result = await http('/v1/captures', 'POST', access.accessToken, input());
    expect(result.status).toBe(200); expect(result.result).not.toHaveProperty('storagePath');
    expect(JSON.stringify(result.result)).not.toContain('player');
  });
  it.each(['account', 'pilot'])('returns the %s quota reset delay in the body and Retry-After header', async quotaKind => {
    const access = await linked(); await createPartnerCapture(access.accessToken, input());
    const quotaPath = quotaKind === 'account' ? `_rate_limits/game_capture_quota_${sha('player')}` : '_rate_limits/game_partner_capture_global';
    const quota = state.rows.get(quotaPath)!;
    quota.count = quotaKind === 'account' ? 20 : 1000;
    quota.reset_at = Date.now() + 120001;
    const result = await http('/v1/captures', 'POST', access.accessToken, input(png, 'quota-blocked-key'));
    expect(result.status).toBe(429);
    expect(result.result).toMatchObject({ error: 'rate_limited', retryAfter: 121 });
    expect(result.headers).toContainEqual(['Retry-After', '121']);
    expect([...state.rows.keys()].filter(path => path.startsWith('game_captures/'))).toHaveLength(1);
  });
});
