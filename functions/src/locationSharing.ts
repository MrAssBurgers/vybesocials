import { onCall } from 'firebase-functions/v2/https';
import { randomBytes } from 'node:crypto';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { normalizeLocationInput, runLocationSharing, type LocationAction } from './_shared/locationSharingAuthority.js';

async function dispatch(uid: string, raw: unknown) {
  const input = normalizeLocationInput(raw, uid);
  enforceRateLimit(await rateLimit(`location:${uid}:${input.action === 'read' ? 'read' : input.action === 'publishPosition' ? 'position' : 'change'}`,
    input.action === 'read' || input.action === 'publishPosition' ? 60 : 30, 60));
  return runLocationSharing(db, uid, input);
}
export const manageLocationSharing = onCall({ region: 'us-central1', timeoutSeconds: 60 }, request => dispatch(requireAuth(request), request.data));
// Keep named deployed entry points strict during cutover. Old unbound inputs
// fail clearly instead of reviving the former raw/legacy authority.
const actionCallable = (action: LocationAction) => onCall({ region: 'us-central1', timeoutSeconds: 60 }, request =>
  dispatch(requireAuth(request), { ...request.data, action }));
export const createLocationRequest = actionCallable('request');
export const respondLocationRequest = actionCallable('respond');
export const stopLocationShare = actionCallable('stop');
export const pauseLocationShare = actionCallable('pause');

/** Expire private grants only. Never copy live coordinates into share rows. */
export const syncLocationShareSnapshots = onSchedule({ schedule: 'every 5 minutes', region: 'us-central1' }, async () => {
  const now = Date.now();
  const rows = await db.collection('_location_grants').where('active', '==', true).where('expires_at_ms', '<=', now).limit(200).get();
  for (const doc of rows.docs) await db.runTransaction(async tx => {
    const current = (await tx.get(doc.ref)).data();
    if (current?.active === true && Number(current.expires_at_ms) <= now) tx.update(doc.ref, { active: false, paused: false, revision: randomBytes(24).toString('hex'), updated_at_ms: now });
  });
  const positions = await db.collection('user_live_locations').where('expires_at_ms', '<=', now).limit(200).get();
  for (const doc of positions.docs) await db.runTransaction(async tx => {
    const current = (await tx.get(doc.ref)).data();
    if (typeof current?.expires_at_ms === 'number' && current.expires_at_ms <= now) tx.delete(doc.ref);
  });
});
