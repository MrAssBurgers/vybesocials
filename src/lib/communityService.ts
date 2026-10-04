import { db, getFirebaseAuth } from '@/lib/firebase';

let observedAuth: ReturnType<typeof getFirebaseAuth>;
let observedUid: string | undefined;
let accountEpoch = 0;
let stopObserving: (() => void) | undefined;
function observeAccount() {
  const auth = getFirebaseAuth();
  if (auth !== observedAuth) {
    stopObserving?.();
    observedAuth = auth;
    observedUid = auth?.currentUser?.uid;
    accountEpoch++;
    stopObserving = auth?.onAuthStateChanged(user => {
      if (observedUid !== user?.uid) { observedUid = user?.uid; accountEpoch++; }
    });
  }
  if (observedUid !== auth?.currentUser?.uid) { observedUid = auth?.currentUser?.uid; accountEpoch++; }
  return { uid: observedUid, epoch: accountEpoch };
}

export type CommunityAccountLease = () => void;
export function communityAccountLease(expectedUid: string | undefined): CommunityAccountLease {
  const started = observeAccount();
  return () => {
    const current = observeAccount();
    if (!expectedUid || current.uid !== expectedUid || current.epoch !== started.epoch) {
      throw Object.assign(new Error('Your account changed. Please try again.'), { code: 'account-changed' });
    }
  };
}

export function communityAccount(): string {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!uid) throw Object.assign(new Error('Sign in to continue'), { code: 'unauthenticated' });
  return uid;
}

/** Community authority always comes from the service, never a browser-written role. */
export async function communityRequest<T>(name: string, body: Record<string, unknown>, guard: CommunityAccountLease = communityAccountLease(communityAccount())): Promise<T> {
  guard();
  const result = await db.functions.invoke<T>(name, { body });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Community request failed'), { code: result.error.code || result.error.name });
  if (!result.data || typeof result.data !== 'object') throw new Error('Community service returned an invalid response');
  return result.data;
}

export type CommunityJoinInput = string | { serverId: string };
export function communityJoinBody(input: CommunityJoinInput): Record<string, unknown> {
  if (typeof input !== 'string') return { serverId: input.serverId };
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    const url = new URL(code);
    if (!['vybehub.app', 'www.vybehub.app'].includes(url.hostname) || url.username || url.password || url.port || url.pathname !== '/community') throw new Error('Use a VYBE invitation link or code');
    code = url.searchParams.get('join') || '';
  }
  if (!/^vyc_[A-Za-z0-9_-]{32}$/.test(code)) throw new Error('Ask the community owner for a current invitation code');
  return { inviteCode: code };
}
