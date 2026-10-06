import { db } from '@/lib/firebase';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';
import { getFirebaseAuth, getAuthSessionGeneration } from '@/lib/firebase/authService';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';
import { foregroundReadPhaseCurrent, getForegroundReadPhase, isAppForeground } from '@/lib/foregroundReadPhase';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const RESUME_DEBOUNCE_MS = 8000;
let stopCurrent: (() => void) | null = null;

/** Keeps auth sessions warm without requesting work for a retired foreground/session. */
export function installAuthSessionKeepAlive(): void {
  if (stopCurrent || typeof window === 'undefined') return;
  let active = true, lastResumeAt = -Infinity;
  let lastResumePhase: ReturnType<typeof getForegroundReadPhase> | null = null;
  let pending: { phase: ReturnType<typeof getForegroundReadPhase>; user: unknown; generation: number } | null = null;
  const eligible = () => active && isAppForeground() && navigator.onLine !== false && hasStoredAuthSession();
  const tick = () => {
    if (!eligible()) return;
    const phase = getForegroundReadPhase();
    const user = getFirebaseAuth()?.currentUser;
    const generation = getAuthSessionGeneration();
    if (pending?.phase === phase && pending.user === user && pending.generation === generation) return;
    const flight = { phase, user, generation };
    const current = () => eligible() && foregroundReadPhaseCurrent(phase) && getFirebaseAuth()?.currentUser === user && getAuthSessionGeneration() === generation;
    pending = flight;
    void (async () => {
      try {
        const { data: { session }, error } = await db.auth.getSession();
        if (!current() || error || !session?.user || session.user.id !== user?.uid) return;
        setWasLoggedIn(true);
        if (session.expires_at && session.expires_at * 1000 - Date.now() >= 10 * 60 * 1000) return;
        if (current()) await refreshFirebaseSession();
      } catch { /* Transport failure keeps the existing session; later foreground/tick can retry. */ }
      finally { if (pending === flight) pending = null; }
    })();
  };
  const onResume = () => {
    if (!eligible()) return;
    const now = Date.now();
    const phase = getForegroundReadPhase();
    if (phase === lastResumePhase && now - lastResumeAt < RESUME_DEBOUNCE_MS) return;
    lastResumeAt = now;
    lastResumePhase = phase;
    tick();
  };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onResume(); };
  const interval = setInterval(tick, REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('app-resumed', onResume);
  window.addEventListener('pageshow', onPageShow);
  stopCurrent = () => {
    active = false;
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onResume);
    window.removeEventListener('app-resumed', onResume);
    window.removeEventListener('pageshow', onPageShow);
  };
  tick();
}

export function uninstallAuthSessionKeepAlive(): void {
  stopCurrent?.();
  stopCurrent = null;
}
