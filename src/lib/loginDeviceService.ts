import { z } from 'zod';
import { db } from '@/lib/firebase';
import { getFirebaseAuth } from '@/lib/firebase/authService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

const id = z.string().min(1).max(160).refine(value => !value.includes('/'));
const receipt = z.object({ ok: z.literal(true), ownerUid: id, authTime: z.number().int().positive(), accountCreatedAt: z.number().int().positive(),
  profileId: id.nullable(), trackingDeferred: z.boolean(), sessionId: id.nullable(), requiresApproval: z.boolean(), reason: z.string().max(100),
  challengeId: id.optional(), expiresAt: z.string().datetime().optional(), deviceLabel: z.string().max(200).optional(),
  geo: z.object({ city: z.string().max(200).nullable().optional(), country: z.string().max(200).nullable().optional(), region: z.string().max(200).nullable().optional(), ip: z.string().max(100).nullable().optional() }).optional(),
});
export async function captureDeviceSignIn(expectedUid?: string, outer: () => void = () => {}) {
  const auth = getFirebaseAuth(), user = auth?.currentUser;
  if (!auth || !user || (expectedUid && user.uid !== expectedUid)) throw new Error('Your sign-in changed. Please retry.');
  const epochGuard = tokenAccountGuard(user.uid), signedIn = user.metadata.lastSignInTime;
  const guard = () => { outer(); epochGuard(); if (getFirebaseAuth() !== auth || auth.currentUser !== user || user.metadata.lastSignInTime !== signedIn) throw new Error('Your sign-in changed. Please retry.'); };
  guard(); const token = await user.getIdTokenResult(); guard();
  const authTime = token.claims.auth_time, created = Date.parse(user.metadata.creationTime || '');
  if (typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime <= 0 || !Number.isSafeInteger(created) || created <= 0) throw new Error('This device sign-in could not be verified.');
  return { auth, user, uid: user.uid, authTime, created, guard };
}
export type DeviceSignIn = Awaited<ReturnType<typeof captureDeviceSignIn>>;
export function deviceConfirmationRequired(error: unknown, signIn: DeviceSignIn) {
  const failure = error as { code?: string; details?: Record<string, unknown> } | null;
  return String(failure?.code).replace(/^functions\//, '') === 'failed-precondition' && failure?.details?.reason === 'sign-in-confirmation-pending'
    && failure.details.ownerUid === signIn.uid && failure.details.authTime === signIn.authTime && failure.details.accountCreatedAt === signIn.created;
}
export async function signOutForDeviceConfirmation(signIn: DeviceSignIn) {
  signIn.guard();
  const result = await db.auth.signOut({ scope: 'local', guard: signIn.guard });
  if (result.error) throw result.error;
}
export async function registerCurrentDevice(signIn: DeviceSignIn, deviceFingerprint: string, method: string, profileId?: string) {
  signIn.guard();
  const result = await db.functions.invoke('auth-login-notify', { body: { expectedOwnerUid: signIn.uid, expectedAuthTime: signIn.authTime,
    expectedAccountCreatedAt: signIn.created, method, deviceFingerprint, userAgent: navigator.userAgent } });
  signIn.guard();
  if (result.error) throw result.error;
  const parsed = receipt.safeParse(result.data);
  if (!parsed.success) throw new Error('This device sign-in was not confirmed. Please retry.');
  const data = parsed.data;
  if (data.ownerUid !== signIn.uid || data.authTime !== signIn.authTime || data.accountCreatedAt !== signIn.created
    || (profileId && data.profileId !== profileId)
    || (data.trackingDeferred ? data.profileId !== null || data.sessionId !== null || data.requiresApproval || data.reason !== 'profile_setup_pending' : !data.profileId || !data.sessionId)
    || (data.requiresApproval && (!data.challengeId || !data.expiresAt || Date.parse(data.expiresAt) <= Date.now() || Date.parse(data.expiresAt) > Date.now() + 11 * 60_000))) throw new Error('This device sign-in was not confirmed. Please retry.');
  return data;
}

/** A stale device record cannot revoke newer verified credentials. Read errors
 * are not sign-outs; Firebase's own token revocation remains authoritative. */
export async function signOutIfCurrentDeviceRevoked(signIn: DeviceSignIn, deviceFingerprint: string, sessionId: string) {
  signIn.guard();
  const { data, error } = await db.from('user_sessions').select('user_id, session_token_hash, revoked_at').eq('id', sessionId).maybeSingle();
  signIn.guard();
  if (error || !data || data.user_id !== signIn.uid || data.session_token_hash !== deviceFingerprint || typeof data.revoked_at !== 'string') return false;
  const cutoff = Date.parse(data.revoked_at);
  if (!Number.isFinite(cutoff) || signIn.authTime * 1000 > cutoff) return false;
  const current = await signIn.user.getIdTokenResult(); signIn.guard();
  if (current.claims.auth_time !== signIn.authTime) return false;
  await signOutForDeviceConfirmation(signIn);
  return true;
}
