import { supabase } from '@/integrations/supabase/client';

let refreshInFlight: ReturnType<typeof supabase.auth.refreshSession> | null = null;

/** Single-flight refresh — concurrent calls share one request (prevents refresh-token rotation races). */
export function refreshSupabaseSession(
  timeoutMs?: number,
): ReturnType<typeof supabase.auth.refreshSession> {
  if (refreshInFlight) return refreshInFlight;

  const refreshPromise = supabase.auth.refreshSession();

  if (timeoutMs == null || timeoutMs <= 0) {
    refreshInFlight = refreshPromise.finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  const timeoutPromise = new Promise<Awaited<ReturnType<typeof supabase.auth.refreshSession>>>(
    (resolve) => {
      setTimeout(
        () => resolve({ data: { session: null, user: null }, error: null } as Awaited<
          ReturnType<typeof supabase.auth.refreshSession>
        >),
        timeoutMs,
      );
    },
  );

  refreshInFlight = Promise.race([refreshPromise, timeoutPromise]).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
