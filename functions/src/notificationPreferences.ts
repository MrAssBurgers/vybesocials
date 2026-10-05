import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, enforceRateLimit, rateLimit } from './_shared/admin.js';
import { manageNotificationPreferencesFor } from './_shared/notificationPreferenceAuthority.js';

export const manageNotificationPreferences = onCall({ cors: true }, async request => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`notification-settings:${uid}`, 90, 60));
  return manageNotificationPreferencesFor(db, uid, request.data);
});
