import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { isMobileOrTabletDevice } from '@/lib/deviceDetection';
import { shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';
import { hasCompletedCurrentIntro } from '@/lib/mobileIntroVersion';

const VybeHome = lazy(() => import('@/pages/VybeHome'));
const Landing = lazy(() => import('@/pages/Landing'));
const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

function useMobileAppEntry(): boolean {
  const [mobileApp, setMobileApp] = useState(
    () => isNativeAppShell() || isMobileOrTabletDevice(),
  );

  useEffect(() => {
    const update = () => setMobileApp(isNativeAppShell() || isMobileOrTabletDevice());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return mobileApp;
}

/**
 * Root `/` gate:
 *  - Signed-in users → /home
 *  - First-time mobile/native logged-out users → MobileIntro (then /auth)
 *  - Native (Despia / Capacitor) + iPad/tablet → Landing (auth)
 *  - Desktop web (logged out) → VybeHome marketing page
 */
export default function RootGate() {
  const { user, loading } = useAuth();
  // Honor VYBE_INTRO_VERSION — bumping the constant re-shows intro after Publish.
  // (Previously only `vybe_intro_seen` was checked, so intro UX changes looked "unpublished".)
  const [introDone, setIntroDone] = useState<boolean>(() => hasCompletedCurrentIntro());
  const isMobileApp = useMobileAppEntry();

  if (loading) return null;
  // Login confirmation in progress — stay on auth surface (Landing), do not bounce to /home.
  if (user && !shouldBlockPostLoginNavigation()) {
    return <Navigate to="/home" replace />;
  }

  const showIntro = !introDone && isMobileApp;
  if (showIntro) {
    return (
      <Suspense fallback={null}>
        <MobileIntro onDone={() => setIntroDone(true)} />
      </Suspense>
    );
  }

  if (isMobileApp) {
    return (
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <VybeHome />
    </Suspense>
  );
}
