import { isLovablePreviewHost } from '@/lib/lovablePreview';

/**
 * Owner identity sourced from build-time env (not committed). When absent,
 * owner status falls back to the server-side `is_owner` check via Cloud
 * Functions. Personal email and usernames are no longer bundled in client JS.
 */
const ENV_EMAIL = (import.meta.env.VITE_OWNER_EMAIL || '').trim().toLowerCase();
const ENV_USERNAMES = String(import.meta.env.VITE_OWNER_USERNAMES || '')
  .toLowerCase()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ENV_AUTH_IDS = String(import.meta.env.VITE_OWNER_AUTH_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Owner auth UID list (populated server-side via env; never personal data). */
export const FOUNDER_AUTH_IDS: readonly string[] = ENV_AUTH_IDS;

/** Lovable preview uses the same Firebase project and rules as vybehub.app — not a sandbox. */
export function isPreviewSandbox(): boolean {
  return false;
}

export function isSignupDisabledInSandbox(): boolean {
  return false;
}

export function shouldBypassMaintenanceForHost(): boolean {
  return false;
}

/** True on Lovable editor/preview hosts (telemetry only — do not gate product behavior). */
export function isLovableAdminPreviewHost(): boolean {
  return isLovablePreviewHost();
}

type FounderUserLike = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null | undefined;

export function isPreviewFounderUser(user: FounderUserLike): boolean {
  if (!user?.id) return false;
  if (FOUNDER_AUTH_IDS.includes(user.id)) return true;
  const email = (user.email || '').trim().toLowerCase();
  if (ENV_EMAIL && email === ENV_EMAIL) return true;
  const username = String(
    user.user_metadata?.username || user.user_metadata?.display_name || '',
  )
    .trim()
    .toLowerCase();
  return ENV_USERNAMES.includes(username);
}

export function isFounderAuthId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return FOUNDER_AUTH_IDS.includes(userId);
}
