import { db, getFirebaseAuth } from '@/lib/firebase';

let observedAuth: ReturnType<typeof getFirebaseAuth>;
export interface CommunityAccountSession { readonly uid: string | undefined; readonly epoch: number }
let session: CommunityAccountSession = Object.freeze({ uid: undefined, epoch: 0 });
const listeners = new Set<() => void>();
let queued = false;
let stopObserving: (() => void) | undefined;
function updateSession(uid: string | undefined, force = false, immediate = false) {
  if (!force && session.uid === uid) return;
  session = Object.freeze({ uid, epoch: session.epoch + 1 });
  if (immediate) for (const listener of [...listeners]) listener();
  else if (!queued && listeners.size) {
    queued = true;
    queueMicrotask(() => { queued = false; for (const listener of [...listeners]) listener(); });
  }
}
export function communityAccountSnapshot() {
  const auth = getFirebaseAuth();
  if (auth !== observedAuth) {
    stopObserving?.();
    observedAuth = auth;
    updateSession(auth?.currentUser?.uid, true);
    stopObserving = auth?.onAuthStateChanged(user => {
      if (observedAuth === auth) updateSession(user?.uid, false, true);
    });
  }
  updateSession(auth?.currentUser?.uid);
  return session;
}
export function communityAccountSubscribe(listener: () => void) {
  listeners.add(listener); communityAccountSnapshot();
  return () => { listeners.delete(listener); };
}
/** Leaving/deleting a community also invalidates work admitted before that action. */
export function communityAccessChanged() {
  updateSession(communityAccountSnapshot().uid, true, true);
}
export function isCommunitySessionCurrent(started: CommunityAccountSession) {
  const current = communityAccountSnapshot();
  return !!started.uid && current.uid === started.uid && current.epoch === started.epoch;
}

export type CommunityAccountLease = () => void;
export function communityAccountLease(expectedUid: string | undefined, started = communityAccountSnapshot()): CommunityAccountLease {
  return () => {
    const current = communityAccountSnapshot();
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
