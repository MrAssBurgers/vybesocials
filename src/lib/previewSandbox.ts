import { isLovablePreviewHost } from '@/lib/lovablePreview';

/** Founder login for Lovable preview / sandbox only — not production vybehub.app. */
export const PREVIEW_FOUNDER_EMAIL = 'barron.bakic@gmail.com';
export const PREVIEW_FOUNDER_USERNAMES = ['bakrix', 'mrassburgers'] as const;

/** Legacy Supabase auth UUID — still honored when present. */
export const LEGACY_FOUNDER_AUTH_ID = '703760a8-1245-4fc1-b242-32619ecc0ef3';

export function isPreviewSandbox(): boolean {
  return isLovablePreviewHost();
}

export function isSignupDisabledInSandbox(): boolean {
  return isPreviewSandbox();
}

export function shouldBypassMaintenanceForHost(): boolean {
  return isPreviewSandbox();
}

type FounderUserLike = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null | undefined;

export function isPreviewFounderUser(user: FounderUserLike): boolean {
  if (!user?.id) return false;
  if (user.id === LEGACY_FOUNDER_AUTH_ID) return true;
  const email = (user.email || '').trim().toLowerCase();
  if (email === PREVIEW_FOUNDER_EMAIL) return true;
  const username = String(
    user.user_metadata?.username || user.user_metadata?.display_name || '',
  )
    .trim()
    .toLowerCase();
  return (PREVIEW_FOUNDER_USERNAMES as readonly string[]).includes(username);
}
