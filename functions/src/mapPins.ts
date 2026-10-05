import { onCall } from 'firebase-functions/v2/https';
import { auth, db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { manageMapPinForUid } from './_shared/mapPinAuthority.js';

export const manageMapPin = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request), read = ['state', 'list', 'read'].includes(String(request.data?.action));
  enforceRateLimit(await rateLimit(`map-pin:${read ? 'read' : 'write'}:${uid}`, read ? 120 : 30, 60));
  return manageMapPinForUid(db, auth, uid, request.data);
});
