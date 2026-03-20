import { ReactNode, useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

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
  const [safetyChecked, setSafetyChecked] = useState(false);

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route)
  );

  // ── SAFETY DELAY: When authReady=true but user=null, check if a stored ──
  // ── token exists. If so, wait briefly for the token refresh to complete. ──
  useEffect(() => {
    if (!authReady || user || isGuestAllowedRoute) {
      setSafetyChecked(true);
      return;
    }

    // authReady=true, user=null, not a guest route → might be a false negative
    try {
      const hasStoredToken = !!localStorage.getItem('sb-agtcyxjxgkdyoxwxkjth-auth-token');
      if (hasStoredToken) {
        // Token exists but user is null — likely mid-refresh. Wait up to 3s.
        const timer = setTimeout(() => setSafetyChecked(true), 3000);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage access failed
    }

    // No stored token — genuinely not signed in
    setSafetyChecked(true);
  }, [authReady, user, isGuestAllowedRoute]);

  // If user appears during the safety wait, mark as checked immediately
  useEffect(() => {
    if (user) setSafetyChecked(true);
  }, [user]);

  // Auth not yet resolved — show an empty shell (splash screen covers this).
  // NEVER redirect here; doing so is the root cause of "user not signed in".
  if (!authReady || (!user && !safetyChecked && !isGuestAllowedRoute)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your session…</p>
        </div>
      </div>
    );
  }

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Redirect to landing if not authenticated (both checks passed)
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
