import { isLovablePreviewHost } from '@/lib/lovablePreview';

/** Founder login — honored on production and Lovable preview (same Firebase backend). */
export const PREVIEW_FOUNDER_EMAIL = 'barron.bakic@gmail.com';
export const PREVIEW_FOUNDER_USERNAMES = ['bakrix', 'mrassburgers'] as const;

/** Legacy Supabase auth UUID — still honored when present. */
export const LEGACY_FOUNDER_AUTH_ID = '703760a8-1245-4fc1-b242-32619ecc0ef3';

/** Firebase Auth UID for mrassburgers / barron.bakic@gmail.com (vybe-daaab). */
export const FIREBASE_FOUNDER_AUTH_ID = '703760a8-1245-4fc1-b242-32619ecc0ef3';

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
  if (user.id === LEGACY_FOUNDER_AUTH_ID) return true;
  if (user.id === FIREBASE_FOUNDER_AUTH_ID) return true;
  if (user.id === '53e0076d-5163-46f5-b711-a58a03393744') return true;
  if (user.id === 'oXZZXoceCdOaCKekqNrDhCfJ90M2') return true;
  const email = (user.email || '').trim().toLowerCase();
  if (email === PREVIEW_FOUNDER_EMAIL) return true;
  const username = String(
    user.user_metadata?.username || user.user_metadata?.display_name || '',
  )
    .trim()
    .toLowerCase();
  return (PREVIEW_FOUNDER_USERNAMES as readonly string[]).includes(username);
}

export function isFounderAuthId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (
    userId === LEGACY_FOUNDER_AUTH_ID ||
    userId === FIREBASE_FOUNDER_AUTH_ID ||
    userId === '53e0076d-5163-46f5-b711-a58a03393744' ||
    userId === 'oXZZXoceCdOaCKekqNrDhCfJ90M2'
  );
}
