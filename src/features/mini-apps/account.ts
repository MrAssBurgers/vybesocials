import { getFirebaseAuth } from '@/lib/firebase/authService';

let auth: ReturnType<typeof getFirebaseAuth>;
let owner: string | undefined;
let epoch = 0;
let unsubscribe: (() => void) | undefined;
function snapshot() {
  const current = getFirebaseAuth();
  if (current !== auth) {
    unsubscribe?.(); auth = current; owner = current?.currentUser?.uid; epoch++;
    unsubscribe = current?.onAuthStateChanged(user => { if (owner !== user?.uid) { owner = user?.uid; epoch++; } });
  }
  if (owner !== current?.currentUser?.uid) { owner = current?.currentUser?.uid; epoch++; }
  return { owner, epoch };
}

/** Captures the session, including sign-out/sign-in to the same account. */
export function miniAppAccountGuard(ownerId: string) {
  const started = snapshot();
  return () => {
    const current = snapshot();
    if (!ownerId || ownerId !== current.owner || current.epoch !== started.epoch) {
      throw Object.assign(new Error('Your account changed. Sign in again before saving your mini app.'), { code: 'account-changed' });
    }
  };
}
