import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

export function requireAuth(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  return request.auth.uid;
}

export async function requireAdmin(request: CallableRequest): Promise<string> {
  const uid = requireAuth(request);
  if (request.auth?.token?.admin === true) return uid;
  const snap = await db.collection('user_roles')
    .where('user_id', '==', uid)
    .where('role', 'in', ['admin', 'owner'])
    .limit(1).get();
  if (snap.empty) throw new HttpsError('permission-denied', 'Admin only');
  return uid;
}

/** Simple Firestore-backed rate limiter. Returns true if request should be allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const ref = db.collection('_rate_limits').doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; reset_at?: number } | undefined;
    if (!data || (data.reset_at ?? 0) < now) {
      tx.set(ref, { count: 1, reset_at: now + windowSec * 1000 });
      return true;
    }
    if ((data.count ?? 0) >= max) return false;
    tx.update(ref, { count: (data.count ?? 0) + 1 });
    return true;
  });
}

export function enforceRateLimit(allowed: boolean) {
  if (!allowed) throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
}
