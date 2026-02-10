import { supabase } from '@/integrations/supabase/client';

/**
 * Query guard: ensures a valid authenticated user exists before running user-specific queries.
 * Returns the user ID if authenticated, or null with a console warning if not.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.warn('[QueryGuard] Auth error:', error.message);
    return null;
  }

  if (!user?.id) {
    console.warn('[QueryGuard] No authenticated user — skipping user-specific query.');
    return null;
  }

  return user.id;
}

/**
 * Validates that a user ID is defined before using it in a query.
 * Logs a warning and returns false if undefined/null.
 */
export function validateUserId(userId: string | undefined | null, context?: string): userId is string {
  if (!userId) {
    console.warn(`[QueryGuard] user_id is ${userId} — skipping query.`, context ? `Context: ${context}` : '');
    return false;
  }
  return true;
}
