import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativePlatform } from '@/lib/capacitor';

const VybeHome = lazy(() => import('@/pages/VybeHome'));
const Landing = lazy(() => import('@/pages/Landing'));

/**
 * Root `/` gate:
 *  - Signed-in users → /home
 *  - Native (Capacitor) builds → Landing (auth) directly, never marketing
 *  - Everyone else (web, logged out) → VybeHome marketing page
 */
export default function RootGate() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen" />;
  if (user) return <Navigate to="/home" replace />;
  if (isNativePlatform) {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <Landing />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VybeHome />
    </Suspense>
  );
}
