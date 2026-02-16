/**
 * Boot-time environment sanity check.
 * Validates required env vars are present and well-formed.
 * Logs warnings via debugLogger — never crashes the app.
 */
import { logEvent } from '@/lib/debugLogger';

export function runEnvSanityCheck() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const issues: string[] = [];

  if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
    issues.push('VITE_SUPABASE_URL is missing or malformed');
  }

  if (!key || typeof key !== 'string' || !key.startsWith('eyJ')) {
    issues.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing or malformed');
  }

  if (!projectId || typeof projectId !== 'string' || projectId.length < 10) {
    issues.push('VITE_SUPABASE_PROJECT_ID is missing or malformed');
  }

  // Verify URL contains the project ID (catches env mismatch)
  if (url && projectId && !url.includes(projectId)) {
    issues.push(`VITE_SUPABASE_URL does not match PROJECT_ID (possible env mismatch)`);
  }

  if (issues.length > 0) {
    issues.forEach(issue => logEvent('error', `[EnvCheck] ${issue}`));
    console.warn('[VYBE EnvCheck] Configuration issues detected:', issues);
  } else {
    logEvent('info', '[EnvCheck] All environment variables validated OK');
  }

  return issues;
}
