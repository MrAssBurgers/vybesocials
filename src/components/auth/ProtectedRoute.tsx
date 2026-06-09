import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { stashAuthReturnPath } from '@/lib/authReturnPath';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Allow guest access to this route (read-only browsing) */
  allowGuest?: boolean;
}

// Routes that guests can browse (view-only)
const GUEST_ALLOWED_ROUTES = ['/home', '/explore', '/clips', '/shorts', '/p/', '/u/'];

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
  const { user, authReady } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route =>
    location.pathname === route || location.pathname.startsWith(route)
  );

  // Is there a stored Supabase session on disk? If yes, the user IS signed in;
  // auth restore just hasn't finished resolving (cold start, slow network,
  // background token refresh). We must NOT bounce them to "/" — that creates
  // the "loading session loop" where DMs redirect to landing then back again.
  const hasStoredToken = hasStoredSupabaseSession();

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Auth still resolving, or token just written (signup/OAuth) before React state updates —
  // render children optimistically instead of bouncing to /auth.
  if (!authReady || (!user && hasStoredToken)) {
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

  return <>{children}</>;
}
