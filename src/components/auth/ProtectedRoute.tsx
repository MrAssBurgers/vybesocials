import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Allow guest access to this route (read-only browsing) */
  allowGuest?: boolean;
}

// Routes that guests can browse (view-only)
const GUEST_ALLOWED_ROUTES = ['/home', '/explore', '/clips', '/shorts', '/p/', '/u/'];

/**
 * Wrapper component that redirects unauthenticated users to the landing page
 * unless the route allows guest access
 */
export function ProtectedRoute({ children, allowGuest }: ProtectedRouteProps) {
  const { user, loading, authReady } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route)
  );

  // While auth is initializing, show content optimistically for guest-allowed routes
  // For protected routes, show a minimal centered spinner (NOT an empty div)
  if (!authReady || loading) {
    if (isGuestAllowedRoute) {
      // Render children immediately — guest-allowed routes don't need auth
      return <>{children}</>;
    }
    // Show a visible loading state instead of empty black div
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" label="Loading..." />
      </div>
    );
  }

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Only redirect when auth is confirmed ready AND no user exists
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // User is authenticated — render children regardless of profile state
  return <>{children}</>;
}
