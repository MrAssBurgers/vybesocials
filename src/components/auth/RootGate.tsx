import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { VybePageLoader } from '@/components/ui/VybeLoader';

const VybeHome = lazy(() => import('@/pages/VybeHome'));
const Landing = lazy(() => import('@/pages/Landing'));
const MobileIntro = lazy(() => import('@/pages/MobileIntro'));

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => { setIsMobile(isMobileViewport()); }, []);

  if (loading) return <VybePageLoader />;
  if (user) return <Navigate to="/home" replace />;

  const showIntro = !introDone && (isNativeAppShell() || isMobile);
  if (showIntro) {
    return (
      <Suspense fallback={<VybePageLoader />}>
        <MobileIntro onDone={() => setIntroDone(true)} />
      </Suspense>
    );
  }

  if (isNativeAppShell() || isMobile) {
    return (
      <Suspense fallback={<VybePageLoader />}>
        <Landing />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<VybePageLoader />}>
      <VybeHome />
    </Suspense>
  );
}
