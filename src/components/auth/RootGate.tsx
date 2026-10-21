import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';
import { hasCompletedCurrentIntro } from '@/lib/mobileIntroVersion';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';

const VybeHome = lazy(() => import('@/pages/VybeHome'));
const Landing = lazy(() => import('@/pages/Landing'));
const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

const EntryLoading = () => (
  <div className="min-h-[100dvh] flex items-center justify-center" role="status" aria-live="polite">
    <span className="sr-only">Loading VYBE…</span>
    <div className="h-8 w-8 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" aria-hidden="true" />
  </div>
);

/** Explicit account links must open the auth screen on desktop marketing `/`. */
export function isAuthEntrySearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get('signup') === 'true' || params.get('mode') === 'login' || params.get('mode') === 'signup';
}

function useNativeAppEntry(): boolean {
  const [nativeApp, setNativeApp] = useState(() => isNativeAppShell());

  useEffect(() => {
    const update = () => setNativeApp(isNativeAppShell());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return nativeApp;
}

/**
 * Root `/` gate:
 *  - Signed-in users → /home
 *  - First-time native logged-out users → MobileIntro (then /auth)
 *  - Returning native (Despia / Capacitor) users → Landing (auth)
 *  - Logged-out web visitors, including phones/tablets → public VybeHome
 */
export default function RootGate() {
  const { user, loading, authReady } = useAuth();
  const location = useLocation();
  const authRequested = isAuthEntrySearch(location.search);
  // Honor VYBE_INTRO_VERSION — bumping the constant re-shows intro after Publish.
  // (Previously only `vybe_intro_seen` was checked, so intro UX changes looked "unpublished".)
  const [introDone, setIntroDone] = useState<boolean>(() => hasCompletedCurrentIntro());
  const isNativeApp = useNativeAppEntry();

  // Login confirmation in progress — stay on auth surface (Landing), do not bounce to /home.
  if (user && !shouldBlockPostLoginNavigation()) {
    return <Navigate to="/home" replace />;
  }

  // A saved account can still be hydrating. Stay on a silent spinner so the
  // password form does not flash, and never say "Restoring your account…".
  if ((loading || !authReady) && hasStoredAuthSession()) return <EntryLoading />;

  const showIntro = !introDone && isNativeApp && !authRequested;
  if (showIntro) {
    return (
      <Suspense fallback={<EntryLoading />}>
        <MobileIntro onDone={() => setIntroDone(true)} />
      </Suspense>
    );
  }

  if (isNativeApp || authRequested) {
    return (
      <Suspense fallback={<EntryLoading />}>
        <Landing />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<EntryLoading />}>
      <VybeHome />
    </Suspense>
  );
}
