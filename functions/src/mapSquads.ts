import { onCall } from 'firebase-functions/v2/https';
import { auth, db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { manageMapSquadForUid } from './_shared/mapSquadAuthority.js';

export const manageMapSquad = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request);
  const read = ['list', 'read', 'matchMembers', 'previewInvite'].includes(request.data?.action);
  enforceRateLimit(await rateLimit(`map-squad:${uid}:${read ? 'read' : 'write'}`, read ? 120 : 30, 60));
  return manageMapSquadForUid(db, auth, uid, request.data);
});
