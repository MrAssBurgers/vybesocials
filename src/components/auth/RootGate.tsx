import { lazy, Suspense, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { isMobileOrTabletDevice } from '@/lib/deviceDetection';
import { VybePageLoader } from '@/components/ui/VybeLoader';

const VybeHome = lazy(() => import('@/pages/VybeHome'));
const Landing = lazy(() => import('@/pages/Landing'));
const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

function useMobileAppEntry(): boolean {
  return isNativeAppShell() || isMobileOrTabletDevice();
}

/**
 * Root `/` gate:
 *  - Signed-in users → /home
 *  - First-time mobile/native logged-out users → MobileIntro (then /auth)
 *  - Native (Despia / Capacitor) builds → Landing (auth) directly
 *  - Everyone else (web desktop, logged out) → VybeHome marketing page
 */
export default function RootGate() {
  const { user, loading } = useAuth();
  const [introDone, setIntroDone] = useState<boolean>(() => {
    try { return !!localStorage.getItem('vybe_intro_seen'); } catch { return true; }
  });
  const isMobileApp = useMobileAppEntry();

  if (loading) return <VybePageLoader delay={0} />;
  if (user) return <Navigate to="/home" replace />;

  const showIntro = !introDone && isMobileApp;
  if (showIntro) {
    return (
      <Suspense fallback={<VybePageLoader delay={0} />}>
        <MobileIntro onDone={() => setIntroDone(true)} />
      </Suspense>
    );
  }

  if (isMobileApp) {
    return (
      <Suspense fallback={<VybePageLoader delay={0} />}>
        <Landing />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<VybePageLoader delay={0} />}>
      <VybeHome />
    </Suspense>
  );
}
