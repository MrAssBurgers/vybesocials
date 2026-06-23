import { db } from '@/lib/firebase';

type RefreshResult = ReturnType<typeof db.auth.refreshSession>;

let refreshInFlight: Promise<Awaited<RefreshResult>> | null = null;

/** Single-flight refresh — concurrent calls share one request. */
export function refreshFirebaseSession(timeoutMs?: number): Promise<Awaited<RefreshResult>> {
  if (refreshInFlight) return refreshInFlight;

  const refreshPromise = db.auth.refreshSession();

  if (timeoutMs == null || timeoutMs <= 0) {
    refreshInFlight = refreshPromise.finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  const timeoutPromise = new Promise<Awaited<RefreshResult>>((resolve) => {
    setTimeout(
      () => resolve({ data: { session: null }, error: null }),
      timeoutMs,
    );
  });

  refreshInFlight = Promise.race([refreshPromise, timeoutPromise]).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
