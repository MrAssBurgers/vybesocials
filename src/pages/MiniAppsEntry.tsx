import { lazy, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SessionRestoringScreen } from '@/components/auth/SessionRestoringScreen';
import MiniAppsGuest from './MiniAppsGuest';

const MiniApps = lazy(() => import('./MiniApps'));

export default function MiniAppsEntry() {
  const { user, loading, authReady } = useAuth();
  if (loading || !authReady) return <SessionRestoringScreen />;
  if (!user) return <MiniAppsGuest />;
  return (
    <ProtectedRoute>
      <Suspense fallback={<SessionRestoringScreen />}>
        <MiniApps />
      </Suspense>
    </ProtectedRoute>
  );
}
