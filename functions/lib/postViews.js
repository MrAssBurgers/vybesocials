import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { recordPostViewFor } from './_shared/postViewAuthority.js';
export const recordPostView = onCall({ region: 'us-central1', timeoutSeconds: 30 }, request => recordPostViewFor(db, requireAuth(request), request.data));
//# sourceMappingURL=postViews.js.map