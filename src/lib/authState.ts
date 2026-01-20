/**
 * Centralized Auth State Machine
 * 
 * Single source of truth for authentication phase, preventing
 * race conditions and ensuring routing decisions wait for resolution.
 */

export type AuthPhase = 
  | 'initializing'   // Auth not yet resolved
  | 'authenticated'  // User logged in, session valid
  | 'unauthenticated' // No user session
  | 'error';         // Auth system error

export interface AuthState {
  phase: AuthPhase;
  userId: string | null;
  profileId: string | null;
  error: string | null;
}

export const INITIAL_AUTH_STATE: AuthState = {
  phase: 'initializing',
  userId: null,
  profileId: null,
  error: null,
};

/**
 * Check if auth is fully resolved (not initializing)
 */
export function isAuthResolved(state: AuthState): boolean {
  return state.phase !== 'initializing';
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(state: AuthState): boolean {
  return state.phase === 'authenticated' && state.userId !== null;
}
