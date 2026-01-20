/**
 * Centralized Backend Configuration
 * 
 * All backend URLs and keys are read from environment variables.
 * This allows swapping the Supabase project without code changes.
 */

// Backend URLs - read once at startup
export const BACKEND_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const BACKEND_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const BACKEND_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

// Validation - fail fast if config is missing
if (!BACKEND_URL || !BACKEND_ANON_KEY) {
  console.error('[Backend] Missing configuration. Check environment variables.');
}

/**
 * Check if backend is properly configured
 */
export function isBackendConfigured(): boolean {
  return Boolean(BACKEND_URL && BACKEND_ANON_KEY);
}

/**
 * Get the storage bucket URL for a given bucket
 */
export function getStorageBucketUrl(bucket: string): string {
  return `${BACKEND_URL}/storage/v1/object/public/${bucket}`;
}
