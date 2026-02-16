import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

/**
 * Returns a guard function for use in mutations.
 * Instead of `throw new Error('Not authenticated')`, call `requireAuth()`.
 * It returns `{ profile, user }` if authenticated, or throws a
 * user-friendly error (with toast) if not.
 */
export function useRequireAuth() {
  const { profile, user, authReady } = useAuth();

  /** Call at the top of any mutationFn. Throws if not authenticated. */
  function requireAuth() {
    if (!authReady) {
      toast.error('Still loading — please try again in a moment.');
      throw new AuthGuardError('Auth not ready');
    }
    if (!user) {
      toast.error('Please sign in to continue.');
      throw new AuthGuardError('Not signed in');
    }
    if (!profile?.id) {
      toast.error('Your profile is loading — try again shortly.');
      throw new AuthGuardError('Profile not loaded');
    }
    return { profile, user };
  }

  return { requireAuth, isAuthenticated: !!user && !!profile?.id && authReady };
}

/**
 * Custom error class so global handlers can distinguish auth guards
 * from real errors and suppress noisy logging.
 */
export class AuthGuardError extends Error {
  readonly isAuthGuard = true;
  constructor(message: string) {
    super(message);
    this.name = 'AuthGuardError';
  }
}
