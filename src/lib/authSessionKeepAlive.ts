import { db } from '@/lib/firebase';
import { isLovablePreviewHost } from '@/lib/lovablePreview';
import { refreshSupabaseSession } from '@/lib/supabaseAuthRefresh';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const RESUME_DEBOUNCE_MS = 8000;

let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastResumeAt = 0;

async function refreshIfNeeded(force = false) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (!hasStoredSupabaseSession()) return;

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    setWasLoggedIn(true);
    if (!force && session.expires_at) {
      const expiresMs = session.expires_at * 1000;
      if (expiresMs - Date.now() >= 10 * 60 * 1000) return;
    }
  }

  await refreshSupabaseSession();
}

/** Keeps Supabase sessions warm on native shells (iOS/Android WebView). Skipped on Lovable preview. */
export function installAuthSessionKeepAlive(): void {
  if (installed || typeof window === 'undefined') return;
  if (isLovablePreviewHost()) return;

  installed = true;

  const tick = () => {
    void refreshIfNeeded();
  };

  tick();
  intervalId = setInterval(tick, REFRESH_INTERVAL_MS);

  const onResume = () => {
    const now = Date.now();
    if (now - lastResumeAt < RESUME_DEBOUNCE_MS) return;
    lastResumeAt = now;
    void refreshIfNeeded();
  };

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
