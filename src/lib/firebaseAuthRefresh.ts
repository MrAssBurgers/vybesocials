import { db } from '@/lib/firebase';
import { getFirebaseAuth, getAuthSessionGeneration } from '@/lib/firebase/authService';

type RefreshResult = Awaited<ReturnType<typeof db.auth.refreshSession>>;
type Flight = { user: unknown; generation: number; promise: Promise<RefreshResult> };
let refreshInFlight: Flight | null = null;

/** Share refresh work only within the same exact SDK session. */
export function refreshFirebaseSession(timeoutMs?: number): Promise<RefreshResult> {
  const user = getFirebaseAuth()?.currentUser ?? null;
  const generation = getAuthSessionGeneration();
  if (refreshInFlight?.user === user && refreshInFlight.generation === generation) return refreshInFlight.promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = db.auth.refreshSession();
  const result = timeoutMs != null && timeoutMs > 0 ? Promise.race([refresh, new Promise<RefreshResult>(resolve => {
    timer = setTimeout(() => resolve({ data: { session: null }, error: { name: 'auth/timeout', message: 'Session refresh timed out.' } }), timeoutMs);
  })]) : refresh;
  const flight: Flight = { user, generation, promise: Promise.resolve(null as never) };
  flight.promise = result.then(value => {
    if (getFirebaseAuth()?.currentUser !== user || getAuthSessionGeneration() !== generation) {
      return { data: { session: null }, error: { name: 'auth/session-changed', message: 'The signed-in session changed.' } };
    }
    return value;
  }).finally(() => {
    clearTimeout(timer);
    if (refreshInFlight === flight) refreshInFlight = null;
  });
  refreshInFlight = flight;
  return flight.promise;
}
