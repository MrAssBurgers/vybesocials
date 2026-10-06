import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { runManageMapSocial } from './_shared/mapSocialAuthority.js';

export { runManageMapSocial };
export const manageMapSocial = onCall({ region: 'us-central1', cors: true, invoker: 'public', timeoutSeconds: 60, cpu: 0.083, concurrency: 1, maxInstances: 20 }, async request => {
  const uid = requireAuth(request);
  const read = request.data?.action === 'list' || request.data?.action === 'read';
  enforceRateLimit(await rateLimit(`map-social:${uid}:${read ? 'read' : 'write'}`, read ? 120 : 30, 60));
  return runManageMapSocial(db, uid, request.data);
});
