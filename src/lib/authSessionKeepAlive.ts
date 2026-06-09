import { supabase } from '@/integrations/supabase/client';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function refreshIfNeeded() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (!hasStoredSupabaseSession()) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    setWasLoggedIn(true);
    if (session.expires_at) {
      const expiresMs = session.expires_at * 1000;
      if (expiresMs - Date.now() < 10 * 60 * 1000) {
        await supabase.auth.refreshSession();
      }
    }
    return;
  }

  await supabase.auth.refreshSession();
}

/** Keeps Supabase sessions warm on native shells (iOS/Android WebView). */
export function installAuthSessionKeepAlive(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const tick = () => {
    void refreshIfNeeded();
  };

  tick();
  intervalId = setInterval(tick, REFRESH_INTERVAL_MS);

  const onResume = () => tick();
  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('app-resumed', onResume);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) onResume();
  });
}

export function uninstallAuthSessionKeepAlive(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  installed = false;
}
