import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { rememberCurrentSessionHash, rememberSelfLoginChallenge } from '@/lib/sessionIdentity';
import { getOrCreateDeviceId } from '@/lib/notifications/pushDiagnostics';
import { clearPendingLoginApproval, setPendingLoginApproval, shouldBlockPostLoginNavigation, type PendingLoginApproval } from '@/lib/loginApprovalGate';
import { captureDeviceSignIn, deviceConfirmationRequired, registerCurrentDevice, signOutForDeviceConfirmation, signOutIfCurrentDeviceRevoked } from '@/lib/loginDeviceService';

const REVOKE_CHECK_INTERVAL_MS = 15_000;
export interface FreshLoginNotifyResult {
  requiresApproval: boolean; challengeId?: string; expiresAt?: string; sessionId?: string;
  deviceLabel?: string; geo?: PendingLoginApproval['location']; reason?: string;
}
const idKey = (uid: string, device: string) => `vybe-app-session-id-${uid}-${device}`;
function readId(uid: string, device: string) { try { return localStorage.getItem(idKey(uid, device)); } catch { return null; } }
function rememberId(uid: string, device: string, id: string) {
  try { localStorage.setItem(idKey(uid, device), id); localStorage.setItem(`vybe-session-tracked-${uid}-${device}`, String(Date.now())); } catch { /* In-memory tracking still works. */ }
}

/** Cold reopen registers only after checked profile setup. Existing credentials
 * remain logged in through network failures; only their current revoked device
 * generation can trigger a sign-out. */
export function useSessionTracking() {
  const { user, profile, authReady } = useAuth();
  useEffect(() => {
    if (!authReady || !user || !profile || profile.user_id !== user.id) return;
    let cancelled = false, running = false, checkedId: string | null = null, lastRegistration = -Infinity;
    const device = getOrCreateDeviceId();
    const guard = () => { if (cancelled) throw new Error('This device view closed.'); };
    const check = async () => {
      if (cancelled || running || shouldBlockPostLoginNavigation()) return;
      running = true;
      try {
        const signIn = await captureDeviceSignIn(user.id, guard);
        rememberCurrentSessionHash(user.id, device);
        if (!checkedId && Date.now() - lastRegistration >= 60_000) {
          lastRegistration = Date.now();
          try {
            const result = await registerCurrentDevice(signIn, device, 'session_resume', profile.id);
            signIn.guard(); checkedId = result.sessionId;
            if (checkedId) rememberId(user.id, device, checkedId);
          } catch (error) {
            signIn.guard();
            if (deviceConfirmationRequired(error, signIn)) { await signOutForDeviceConfirmation(signIn); return; }
            // Retry registration later; never treat an outage as revocation.
          }
        }
        // Confirmed memory wins even if disk was full and retained an old ID.
        const currentId = checkedId || readId(user.id, device);
        if (currentId) await signOutIfCurrentDeviceRevoked(signIn, device, currentId);
      } catch { /* Retired account, failed token refresh or read: keep current credentials. */ }
      finally { running = false; }
    };
    void check();
    const interval = setInterval(() => void check(), REVOKE_CHECK_INTERVAL_MS);
    const retry = () => { lastRegistration = -Infinity; void check(); };
    window.addEventListener('online', retry);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener('online', retry); };
  }, [authReady, user, profile?.id, profile?.user_id]);
}

/** Interactive confirmation failures stay errors rather than claiming approval. */
export async function notifyFreshLogin(method: string): Promise<FreshLoginNotifyResult> {
  const signIn = await captureDeviceSignIn(), device = getOrCreateDeviceId();
  const payload = await registerCurrentDevice(signIn, device, method);
  signIn.guard(); rememberCurrentSessionHash(signIn.uid, device);
  if (payload.sessionId) rememberId(signIn.uid, device, payload.sessionId);
  if (payload.requiresApproval) {
    rememberSelfLoginChallenge(signIn.uid, payload.challengeId!);
    setPendingLoginApproval({ challengeId: payload.challengeId!, expiresAt: payload.expiresAt, email: signIn.user.email || undefined,
      deviceLabel: payload.deviceLabel, location: payload.geo, userId: signIn.uid, method });
  } else clearPendingLoginApproval();
  return { requiresApproval: payload.requiresApproval, sessionId: payload.sessionId ?? undefined, challengeId: payload.challengeId,
    expiresAt: payload.expiresAt, deviceLabel: payload.deviceLabel, geo: payload.geo, reason: payload.reason };
}
