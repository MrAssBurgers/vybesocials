import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';

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
  const { user, loading } = useAuth();
  const location = useLocation();

  // Check if current route allows guest access
  const isGuestAllowedRoute = allowGuest || GUEST_ALLOWED_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route)
  );

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-xl mx-auto space-y-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Allow guest access to browse-only routes
  if (!user && isGuestAllowedRoute) {
    return <>{children}</>;
  }

  // Redirect to landing if not authenticated
  if (!user) {
    // Preserve the attempted URL so we can redirect back after login
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
