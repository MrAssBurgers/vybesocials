export interface AuthAttemptSnapshot { uid: string | undefined; epoch: number }
export interface AuthSessionAttempt {
  guard: () => void;
  owns: () => boolean;
  isCurrent: () => boolean;
  bindAuthenticated: (uid: string) => void;
  signedOut: () => void;
  endCheck: () => void;
}

const retired = () => Object.assign(new Error('This sign-in changed. Please try again.'), { code: 'auth-attempt-retired' });
export function isRetiredAuthAttempt(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'auth-attempt-retired';
}

/** Auth listeners also receive signed-out events, so undefined is a valid
 * expected identity here. Their late continuations must still reject ABA. */
export function captureAuthSnapshotGuard(snapshot: () => AuthAttemptSnapshot, expectedUid: string | undefined) {
  const bound = snapshot();
  return () => {
    const current = snapshot();
    if (bound.uid !== expectedUid || current.uid !== bound.uid || current.epoch !== bound.epoch) throw retired();
  };
}

/** A new interactive attempt owns the gate even when it uses the same UID.
 * Firebase's account epoch separately retires A → B → A continuations. */
export function createAuthAttemptController(
  snapshot: () => AuthAttemptSnapshot,
  gate: { begin: () => void; end: () => void },
) {
  let generation = 0;
  let checking = false;
  return {
    start(expectedUid?: string, check = true): AuthSessionAttempt {
      let bound = snapshot();
      if (expectedUid !== undefined && bound.uid !== expectedUid) throw retired();
      const id = ++generation;
      let phase: 'initial' | 'authenticated' | 'signed-out' = expectedUid === undefined ? 'initial' : 'authenticated';
      checking = check;
      if (check) gate.begin(); else gate.end();
      const owns = () => id === generation;
      const guard = () => {
        const current = snapshot();
        if (!owns() || current.uid !== bound.uid || current.epoch !== bound.epoch) throw retired();
      };
      return {
        guard, owns,
        isCurrent() { try { guard(); return true; } catch { return false; } },
        bindAuthenticated(uid) {
          // Only first-factor completion may deliberately replace the starting
          // account. An already-bound confirmation cannot rebind after ABA.
          const current = snapshot();
          const expectedEpoch = bound.epoch + (bound.uid === uid ? 0 : 1);
          if (!owns() || phase !== 'initial' || !uid || current.uid !== uid || current.epoch !== expectedEpoch) throw retired();
          bound = current; phase = 'authenticated';
        },
        signedOut() {
          // Intentional sign-out changes the epoch. Do not compare its old
          // account snapshot, but never adopt a replacement signed-in account.
          const current = snapshot();
          if (!owns() || phase !== 'authenticated' || current.uid !== undefined) throw retired();
          bound = current; phase = 'signed-out';
        },
        endCheck() {
          guard();
          if (checking) { checking = false; gate.end(); }
        },
      };
    },
    retire() {
      generation++;
      if (checking) { checking = false; gate.end(); }
    },
  };
}

/** Shared by password and OAuth confirmation. Failure cleanup belongs to the
 * same attempt as the request; a late failure has no authority over a new one. */
export async function completeAuthConfirmation<T>(attempt: AuthSessionAttempt, steps: {
  check: (guard: () => void) => Promise<T | null>;
  signOut: () => Promise<void>;
  hydrate: () => void;
}): Promise<T | null> {
  attempt.guard();
  try {
    const result = await steps.check(attempt.guard);
    attempt.guard();
    if (result !== null) {
      await steps.signOut();
      attempt.guard();
    } else {
      steps.hydrate();
      attempt.guard();
    }
    attempt.endCheck();
    return result;
  } catch (error) {
    if (attempt.isCurrent()) {
      try { await steps.signOut(); } catch { /* Preserve the original failure. */ }
      if (attempt.isCurrent()) attempt.endCheck();
    }
    throw error;
  }
}
