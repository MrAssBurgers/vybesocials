import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';
import { db, requireAuth } from './_shared/admin.js';
import {
  PartnerError, PARTNER_RETENTION_MS, PARTNER_SCOPES, PARTNER_TTL_MS, connectionReceipt,
  deviceFromUserCode, partnerRateLimit, randomConnectionId, type PartnerConnection,
} from './_shared/gamePartnerCore.js';

const opts = { region: 'us-central1', invoker: 'public' as const, timeoutSeconds: 60 };
async function partnerUser<T>(request: CallableRequest, action: (uid: string) => Promise<T>): Promise<T> {
  const uid = requireAuth(request);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('failed-precondition', 'This account cannot connect games.');
  try {
    await partnerRateLimit(`consent:${uid}`, 30);
    return await action(uid);
  } catch (error) {
    if (!(error instanceof PartnerError)) throw error;
    const code = error.status === 404 ? 'not-found' : error.status === 400 ? 'invalid-argument'
      : error.status === 429 ? 'resource-exhausted' : 'failed-precondition';
    throw new HttpsError(code, error.message);
  }
}

export const getGamePartnerLink = onCall(opts, request => partnerUser(request, uid => db.runTransaction(async tx => {
  const { device, game } = await deviceFromUserCode(tx, request.data?.userCode, uid);
  return {
    clientId: device.client_id, gameName: game.display_name.slice(0, 80), publisherName: game.publisher_name.slice(0, 120),
    scopes: [...PARTNER_SCOPES], expiresAt: device.expires_at_ms,
    status: device.expires_at_ms <= Date.now() ? 'expired' : device.status,
  };
})));

export const approveGamePartnerLink = onCall(opts, request => partnerUser(request, async uid => {
  await partnerRateLimit(`approvals:${uid}`, 20, 86400);
  const connectionId = randomConnectionId();
  return db.runTransaction(async tx => {
    const { ref, device, game } = await deviceFromUserCode(tx, request.data?.userCode, uid);
    const now = Date.now();
    if (device.expires_at_ms <= now) throw new PartnerError(409, 'expired_token', 'This game code expired. Start again in your game.');
    if (device.status === 'approved') {
      const existing = (await tx.get(db.collection('game_partner_connections').doc(device.connection_id!))).data() as PartnerConnection | undefined;
      if (existing?.owner_uid === uid && existing.status === 'active' && existing.expires_at_ms > now) return connectionReceipt(device.connection_id!, existing);
    }
    if (device.status !== 'pending') throw new PartnerError(409, 'conflict', 'This game code has already been used or declined.');
    const connection: PartnerConnection = {
      owner_uid: uid, client_id: device.client_id, game_name: game.display_name.slice(0, 80), publisher_name: game.publisher_name.slice(0, 120),
      scopes: [...PARTNER_SCOPES], status: 'active', created_at_ms: now, expires_at_ms: now + PARTNER_TTL_MS, cleanup_at_ms: now + PARTNER_RETENTION_MS,
    };
    tx.create(db.collection('game_partner_connections').doc(connectionId), connection);
    tx.update(ref, { owner_uid: uid, connection_id: connectionId, status: 'approved' });
    return connectionReceipt(connectionId, connection);
  });
}));

export const denyGamePartnerLink = onCall(opts, request => partnerUser(request, uid => db.runTransaction(async tx => {
  const { ref, device } = await deviceFromUserCode(tx, request.data?.userCode, uid);
  if (device.expires_at_ms <= Date.now()) throw new PartnerError(409, 'expired_token', 'This game code expired.');
  if (device.status === 'denied') return { ok: true };
  if (device.status !== 'pending') throw new PartnerError(409, 'conflict', 'This game code has already been used.');
  tx.update(ref, { owner_uid: uid, status: 'denied' });
  return { ok: true };
})));

export const listGamePartnerConnections = onCall(opts, request => partnerUser(request, async uid => {
  // At most 20 approvals/account/day, with one-day bounded retention.
  const snapshot = await db.collection('game_partner_connections').where('owner_uid', '==', uid).limit(100).get();
  const connections = snapshot.docs.map(doc => connectionReceipt(doc.id, doc.data() as PartnerConnection));
  connections.sort((a, b) => b.createdAt - a.createdAt);
  return { connections };
}));

export const revokeGamePartnerConnection = onCall(opts, request => partnerUser(request, uid => db.runTransaction(async tx => {
  const id = request.data?.connectionId;
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new PartnerError(400, 'invalid_request', 'Choose a game connection.');
  const ref = db.collection('game_partner_connections').doc(id);
  const connection = (await tx.get(ref)).data() as PartnerConnection | undefined;
  if (!connection || connection.owner_uid !== uid) throw new PartnerError(404, 'not_found', 'Game connection not found.');
  tx.update(ref, { status: 'revoked', revoked_at_ms: Date.now() });
  return { ok: true };
})));

/** Physical deletion is bounded; authorization always checks expiry before cleanup. */
export const cleanupGamePartnerData = onSchedule({ schedule: 'every 30 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
  const now = Date.now();
  const uploads = await db.collection('game_partner_uploads').where('cleanup_at_ms', '<=', now).limit(50).get();
  for (const upload of uploads.docs) {
    await db.runTransaction(async tx => {
      const state = (await tx.get(upload.ref)).data();
      if (state) tx.update(upload.ref, { status: 'expired' });
    });
    // Six deterministic immutable keys cover crashes before a chunk's Firestore acknowledgement.
    for (let index = 0; index < 6; index++) await getStorage().bucket().file(`game-partner-staging/${upload.id}/${index}`).delete({ ignoreNotFound: true });
    // Keep a short tombstone and sweep again, including a late storage write
    // whose request lost its response before Firestore acknowledgement.
    if (Number(upload.data().purge_at_ms) <= now) await upload.ref.delete();
    else await upload.ref.update({ cleanup_at_ms: Number(upload.data().purge_at_ms) });
  }
  for (const collection of ['game_partner_devices', 'game_partner_codes', 'game_partner_tokens', 'game_partner_connections']) {
    const expired = await db.collection(collection).where('cleanup_at_ms', '<=', now).limit(100).get();
    if (expired.empty) continue;
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
});
