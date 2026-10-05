import { onCall } from 'firebase-functions/v2/https';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { publicationHash } from './_shared/postPublicationProof.js';
import { normalizeManagePostInput, runManagePost } from './_shared/postPublicationAuthority.js';

export const managePost = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request), input = normalizeManagePostInput(request.data, uid);
  enforceRateLimit(await rateLimit(`manage-post:${publicationHash([uid, input.action === 'read' ? 'read' : 'write'])}`, input.action === 'read' ? 60 : 30, 60));
  return runManagePost(db, uid, request.data);
});
