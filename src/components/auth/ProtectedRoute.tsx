import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';
import { GuestContentGate } from './GuestContentGate';
const AccountProfileStatus = lazy(() => import('./AccountProfileStatus'));

function RestoringSession() {
  const [delayed, setDelayed] = useState(false);
  const location = useLocation();
  useEffect(() => { const timer = setTimeout(() => setDelayed(true), 8_000); return () => clearTimeout(timer); }, []);
  return <div role="status" aria-label="Restoring your session" className="min-h-screen bg-background flex flex-col gap-4 items-center justify-center px-6 text-center">
    <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
    {delayed && <>
      <p className="text-sm text-muted-foreground">Your session is taking longer than usual to load.</p>
      <button className="rounded-full bg-primary px-5 py-2 font-medium" onClick={() => window.location.reload()}>Try loading again</button>
      <Link className="text-sm underline" to="/auth" onClick={() => stashAuthReturnPath(`${location.pathname}${location.search}${location.hash}`)}>Go to sign in</Link>
    </>}
  </div>;
}

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
 * HARDENED FIX: Uses `authReady` AND checks for stored tokens before redirecting.
 * If authReady is true but user is null, we double-check that there isn't a
 * token refresh in progress before redirecting. This prevents the "user not
 * signed in" bug that occurs when getSession() returns null during a background
 * token refresh.
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
  if (!authReady) return <RestoringSession />;

  if (!user && hasStoredToken) {
    return <RestoringSession />;
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
    return <Suspense fallback={<RestoringSession />}><AccountProfileStatus /></Suspense>;
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
