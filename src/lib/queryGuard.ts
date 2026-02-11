/**
 * Query Guard Utility
 * Prevents queries from executing with undefined/null user IDs
 */

/**
 * Validates that a userId is safe to use in Supabase queries.
 * Returns the userId if valid, or null if invalid (preventing eq.undefined errors).
 */
export function guardUserId(userId: string | null | undefined, context?: string): string | null {
  if (!userId || userId === 'undefined' || userId === 'null') {
    if (context) {
      console.warn(`[QueryGuard] Blocked query with invalid userId in: ${context}`);
    }
    return null;
  }
  return userId;
}

/**
 * Use as the `enabled` flag for user-specific queries.
 * Ensures both authReady and a valid userId exist.
 */
export function queryEnabled(userId: string | null | undefined): boolean {
  return !!userId && userId !== 'undefined' && userId !== 'null';
}

/**
 * Safe fallback for queries that would fail with undefined userId.
 * Returns an empty array or provided fallback.
 */
export function safeQueryFallback<T>(fallback?: T): T {
  return fallback ?? ([] as unknown as T);
}
