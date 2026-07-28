import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Allow guest access to this route (read-only browsing) */
  allowGuest?: boolean;
}

// Routes that guests can browse (view-only)
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
  const { user, profile, authReady } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route =>
    location.pathname === route || location.pathname.startsWith(route)
  );

  // Is there a stored Supabase session on disk? If yes, the user IS signed in;
  // auth restore just hasn't finished resolving (cold start, slow network,
  // background token refresh). We must NOT bounce them to "/" — that creates
  // the "loading session loop" where DMs redirect to landing then back again.
  const hasStoredToken = hasStoredAuthSession();

  // Login confirmation pending — keep the user on auth until approved.
  if (shouldBlockPostLoginNavigation()) {
    return <Navigate to="/auth" replace />;
  }

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Auth still restoring — never treat as signed-out (OAuth redirect race).
  // Show a tiny bootstrap shell unless we already have a disk session hint
  // (then keep children for DM/home cold-start continuity).
  if (!authReady) {
    if (hasStoredToken) return <>{children}</>;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user && hasStoredToken) {
    return <>{children}</>;
  }

  // Genuinely signed out — stash intended destination, then send to auth.
  if (!user) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    if (returnTo.length > 1 && !returnTo.startsWith('/auth') && returnTo !== '/') {
      stashAuthReturnPath(returnTo);
    }
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // A signed-in account is not fully initialized until onboarding is explicitly
  // complete. Missing/unknown profile state must never fall through to Home.
  if (location.pathname !== '/onboarding' && profile?.onboarding_completed !== true) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
