import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';
import { GuestContentGate } from './GuestContentGate';
import { getAuthRestoreState } from '@/lib/firebase/authService';
import { SessionRestoringScreen } from './SessionRestoringScreen';
const AccountProfileStatus = lazy(() => import('./AccountProfileStatus'));

interface ProtectedRouteProps {
  children: ReactNode;
  /** Allow guest access to this route (read-only browsing) */
  allowGuest?: boolean;
}

// Read-only entry routes that retain the destination while asking guests to sign in.
const GUEST_ALLOWED_ROUTES = ['/home', '/explore', '/clips', '/shorts', '/p/', '/u/', '/friend/'];

/**
 * Wrapper component that redirects unauthenticated users to the landing page
 * unless the route allows guest access.
 *
 * AuthProvider distinguishes unresolved native restoration from a settled
 * signed-out account. Disk hints never override that checked result.
 */
export function ProtectedRoute({ children, allowGuest }: ProtectedRouteProps) {
  const { user, profile, authReady, profileSetupError } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route =>
    location.pathname === route || location.pathname.startsWith(route.endsWith('/') ? route : `${route}/`)
  );

  // A stored session is a restoration hint, not authorization. Avoid redirecting
  // during cold start, a slow network, or
  // background token refresh). We must NOT bounce them to "/" — that creates
  // the "loading session loop" where DMs redirect to landing then back again.
  const hasStoredToken = hasStoredAuthSession();

  // Login confirmation pending — keep the user on auth until approved.
  if (shouldBlockPostLoginNavigation()) {
    stashAuthReturnPath(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to="/auth" replace />;
  }

  // An explicitly public component may opt in; database-backed guest routes
  // show the account requirement instead of issuing guaranteed-denied reads.
  if (!user && allowGuest === true) return <>{children}</>;
  if (!user && authReady && !hasStoredToken && isGuestAllowedRoute) {
    return <GuestContentGate />;
  }

  // A disk hint cannot authorize mounting account-backed queries.
  // Pending recovery stays silent. The restoring sentence is only for a failed save.
  if (!authReady && getAuthRestoreState() === 'error') return <SessionRestoringScreen />;
  if (!authReady) {
    return (
      <div role="status" aria-label="Loading VYBE" className="min-h-screen bg-background flex items-center justify-center">
        <span className="sr-only">Loading VYBE…</span>
        <div className="h-8 w-8 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" aria-hidden="true" />
      </div>
    );
  }

  // Genuinely signed out — stash intended destination, then send to auth.
  if (!user) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    if (returnTo.length > 1 && !returnTo.startsWith('/auth') && returnTo !== '/') {
      stashAuthReturnPath(returnTo);
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Provisioning failure is recoverable account state, not unfinished onboarding.
  if (profileSetupError || !profile?.id || profile.user_id !== user.id) {
    return <Suspense fallback={<div role="status" className="min-h-screen bg-background flex items-center justify-center">Loading your profile…</div>}><AccountProfileStatus /></Suspense>;
  }

  // A signed-in account is not fully initialized until onboarding is explicitly
  // complete. Missing/unknown profile state must never fall through to Home.
  if (location.pathname !== '/onboarding' && profile?.onboarding_completed !== true) {
    // The profile may still be restoring after the account is ready. Keep the
    // exact destination through both that transient gate and real onboarding.
    stashAuthReturnPath(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
