import { onCall } from 'firebase-functions/v2/https';
import { premiumStatusForRequest } from './_shared/premiumAuthority.js';

/** Browser/native clients reach the callable; its verified Firebase identity
 * and server-owned grants still authorize every status response. */
export const checkPremiumSubscription = onCall(
  { cors: true, invoker: 'public' },
  premiumStatusForRequest,
);
