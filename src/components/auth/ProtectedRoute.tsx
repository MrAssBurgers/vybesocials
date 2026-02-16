import { ReactNode } from 'react';
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
 * KEY FIX: Uses `authReady` instead of `loading` to prevent premature redirects
 * that caused the "user not signed in" bug. We only redirect once auth has
 * fully initialised (getSession + onAuthStateChange resolved).
 */
export function ProtectedRoute({ children, allowGuest }: ProtectedRouteProps) {
  const { user, authReady } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route)
  );

  // Auth not yet resolved — show an empty shell (splash screen covers this).
  // NEVER redirect here; doing so is the root cause of "user not signed in".
  if (!authReady) {
    return <div className="min-h-screen bg-background" />;
  }

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Redirect to landing if not authenticated (authReady is true, so this is real)
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
