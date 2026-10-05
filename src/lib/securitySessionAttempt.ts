import { getFirebaseAuth } from '@/lib/firebase/authService';
import type { TokenAccountGuard } from './tokenMarketplaceService';

type Attempt = { version: 1; ownerUid: string; authTime: number; requestId: string };
const storageKey = (uid: string) => `vybe-security-revocation-v1:${encodeURIComponent(uid)}`;
const invalid = () => new Error('This sign-out request cannot be recovered safely. Sign out here and clear this request before trying again.');
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function currentSecuritySignIn(uid: string, guard: TokenAccountGuard) {
  guard();
  const user = getFirebaseAuth()?.currentUser;
  if (!user || user.uid !== uid) throw new Error('Your account changed. Reopen security settings.');
  // Read the current session's token claims. Forcing a refresh here could lose
  // the still-valid ID token needed to reconcile a lost revocation response.
  const token = await user.getIdTokenResult(); guard();
  if (getFirebaseAuth()?.currentUser !== user || token.claims.sub !== uid || !Number.isSafeInteger(token.claims.auth_time)
    || Number(token.claims.auth_time) <= 0 || Number(token.claims.auth_time) * 1000 > Date.now() + 1000) throw invalid();
  return Number(token.claims.auth_time);
}
export async function prepareSecurityRevokeAttempt(uid: string, guard: TokenAccountGuard): Promise<Attempt> {
  const authTime = await currentSecuritySignIn(uid, guard);
  if (Date.now() - authTime * 1000 > 300000) throw new Error('Sign in again before signing out all devices. You can sign out here and clear any unconfirmed request.');
  const key = storageKey(uid);
  let existing: unknown;
  try { const raw = sessionStorage.getItem(key); existing = raw === null ? null : JSON.parse(raw); } catch { throw invalid(); }
  if (existing !== null) {
    const row = existing as Partial<Attempt>;
    if (!row || typeof row !== 'object' || Array.isArray(row) || row.version !== 1 || row.ownerUid !== uid || !Number.isSafeInteger(row.authTime) || Number(row.authTime) <= 0 || !uuid(row.requestId)) throw invalid();
    if (row.authTime === authTime) return row as Attempt;
    if (Number(row.authTime) > authTime) throw invalid();
    // A newer verified sign-in deliberately starts a separate scope. Never
    // reuse the old request against fresh credentials.
  }
  const attempt: Attempt = { version: 1, ownerUid: uid, authTime, requestId: crypto.randomUUID() };
  guard();
  try { const serialized = JSON.stringify(attempt); sessionStorage.setItem(key, serialized); if (sessionStorage.getItem(key) !== serialized) throw invalid(); } catch { throw invalid(); }
  return attempt;
}
export async function checkSecurityRevokeSignIn(uid: string, expectedAuthTime: number, guard: TokenAccountGuard) {
  if (await currentSecuritySignIn(uid, guard) !== expectedAuthTime) throw new Error('Your sign-in changed. Reopen security settings before changing sessions.');
}
export function completeSecurityRevokeAttempt(uid: string, requestId: string, guard: TokenAccountGuard) {
  guard();
  try { const row = JSON.parse(sessionStorage.getItem(storageKey(uid)) || 'null'); if (row?.ownerUid === uid && row.requestId === requestId) sessionStorage.removeItem(storageKey(uid)); } catch { /* Confirmed server result remains valid. Explicit retirement can clear damaged storage. */ }
}
/** Explicit local-only exit for an expired, malformed or unconfirmed attempt. */
export function retireSecurityRevokeAttempt(uid: string, guard: TokenAccountGuard) {
  guard();
  try { sessionStorage.removeItem(storageKey(uid)); if (sessionStorage.getItem(storageKey(uid)) !== null) throw invalid(); } catch { throw new Error('This browser could not clear sign-out recovery. Close this tab, then sign in again.'); }
}
