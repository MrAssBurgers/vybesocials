import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';

/**
 * Wraps marketing pages (Landing, VybeHome) so:
 *  - Logged-in users get sent straight to /home (no marketing re-shown).
 *  - Native (Despia / Capacitor) builds skip marketing entirely and go to /home or /
 *    auth handling — the APK should never show the public website.
 */
export function PublicOnlyRoute({ children, redirectTo = '/home' }: { children: ReactNode; redirectTo?: string }) {
  const { user, loading } = useAuth();

  if (isNativeAppShell()) {
    return <Navigate to={redirectTo} replace />;
  }
  if (loading) return null;
  if (user) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
