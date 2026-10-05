import { onCall } from 'firebase-functions/v2/https';
import { auth, db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { manageMapWaveForUid } from './_shared/mapWaveAuthority.js';

export const manageMapWave = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`map-wave:${uid}`, 30, 60));
  return manageMapWaveForUid(db, auth, uid, request.data);
});
