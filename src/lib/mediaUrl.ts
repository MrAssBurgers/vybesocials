import { getSupabaseProjectRef } from '@/lib/supabaseStorageKey';

/** Retired Supabase projects still referenced in old seed/migration rows. */
const LEGACY_SUPABASE_REFS = [
  'szthqtnbepupjqjxaduu',
  'agtcyxjxgkdyoxwxkjth',
  'hprmicwhlaaqfgshucec',
  'eabvbtkxdbttjpdpbmuw',
];

const BLOCKED_MEDIA_PATTERNS = [
  /videos\.pexels\.com/i,
  /images\.pexels\.com/i,
];

const PLACEHOLDER_FILENAMES = new Set(['avatar.png', 'avatar.jpg', 'placeholder.png']);

export function getSupabaseStorageBase(): string {
  const fromEnv = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return `https://${getSupabaseProjectRef()}.db.co`;
}

/**
 * Rewrite legacy hosts, resolve bare storage paths, and drop URLs that always 403/400.
 */
export function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  let trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;

  if (BLOCKED_MEDIA_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  const base = getSupabaseStorageBase();
  const currentRef = getSupabaseProjectRef();

  for (const ref of LEGACY_SUPABASE_REFS) {
    if (ref === currentRef) continue;
    if (trimmed.includes(`${ref}.db.co`)) {
      trimmed = trimmed.replace(`https://${ref}.db.co`, base);
      break;
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const filename = trimmed.split('/').pop()?.split('?')[0] || '';
    if (PLACEHOLDER_FILENAMES.has(filename) && !trimmed.includes('/storage/v1/object/')) {
      return null;
    }
    return trimmed;
  }

  const clean = trimmed.replace(/^\/+/, '');
  if (PLACEHOLDER_FILENAMES.has(clean)) return null;

  if (/^(avatars|media|stories|messages|posts|clips|dm-media)\//i.test(clean)) {
    return `${base}/storage/v1/object/public/${clean}`;
  }

  if (/\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)(\?|$)/i.test(clean)) {
    return `${base}/storage/v1/object/public/media/${clean}`;
  }

  return null;
}

export function isValidMediaUrl(url: string | null | undefined): boolean {
  return normalizeMediaUrl(url) !== null;
}

export function shouldPreloadMediaUrl(url: string | null | undefined): boolean {
  const normalized = normalizeMediaUrl(url);
  if (!normalized) return false;
  return !BLOCKED_MEDIA_PATTERNS.some((pattern) => pattern.test(normalized));
}
