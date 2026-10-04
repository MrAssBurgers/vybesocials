import { onCall } from 'firebase-functions/v2/https';
import { auth, db, requireAuth } from './_shared/admin.js';
import { contactDiscovery } from './_shared/contactDiscoveryAuthority.js';

/** Contact hashes are request-local; only explicit, Auth-verified opt-ins are indexed. */
export const matchContacts = onCall({ maxInstances: 10, concurrency: 20 }, request =>
  contactDiscovery(db, auth, requireAuth(request), request.data));

export { hashPhoneE164Server } from './_shared/contactDiscoveryAuthority.js';
