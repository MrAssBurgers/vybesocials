import { applicationDefault, getApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { createTokenAccountLookup } from './_shared/tokenAccountAdmission.js';
import { manageRoulette } from './_shared/rouletteAuthority.js';

export const findRouletteMatch = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true, invoker: 'public' }, async request => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`roulette:${uid}`, 90, 60));
  const app = getApp();
  const lookup = createTokenAccountLookup({ projectId: app.options.projectId || process.env.GCLOUD_PROJECT || '', emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    credential: () => (app.options.credential ?? applicationDefault()).getAccessToken() });
  return manageRoulette(db, lookup, uid, request.auth!.token, request.data);
});
