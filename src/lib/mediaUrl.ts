import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/firebase/config';

/** Retired Supabase hosts still referenced in old seed/migration rows. */
const LEGACY_SUPABASE_HOSTS = [
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

function firebasePublicUrl(bucket: string, objectPath: string): string {
  const encoded = encodeURIComponent(objectPath).replace(/%2F/g, '%2F');
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
}

function getStorageBucket(): string | null {
  try {
    if (!isFirebaseConfigured()) return null;
    return getFirebaseConfig().storageBucket;
  } catch {
    return null;
  }
}

/**
 * Rewrite legacy Supabase storage hosts, resolve bare storage paths, and drop URLs that always 403/400.
 */
export function normalizeMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  let trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;

  if (BLOCKED_MEDIA_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  const bucket = getStorageBucket();

  // Fix object paths that incorrectly include the bucket id as a prefix (migration artifact).
  if (bucket) {
    const bucketPrefix = `${bucket}/`;
    if (trimmed.startsWith(bucketPrefix)) {
      trimmed = trimmed.slice(bucketPrefix.length);
    }
    const fbObject = trimmed.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
    if (fbObject) {
      let objectPath = decodeURIComponent(fbObject[2]!.replace(/\+/g, ' '));
      if (objectPath.startsWith(`${fbObject[1]}/`)) {
        objectPath = objectPath.slice(fbObject[1]!.length + 1);
        trimmed = firebasePublicUrl(fbObject[1]!, objectPath);
      }
    }
  }

  // Legacy Supabase public object URL → Firebase Storage
  const supabasePublic = trimmed.match(
    /https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i,
  );
  if (supabasePublic && bucket) {
    const objectPath = `${supabasePublic[1]}/${supabasePublic[2]}`;
    trimmed = firebasePublicUrl(bucket, objectPath);
  }

  // Legacy .db.co host (old Lovable CDN shim)
  for (const ref of LEGACY_SUPABASE_HOSTS) {
    if (trimmed.includes(`${ref}.db.co`)) {
      const pathMatch = trimmed.match(/\/storage\/v1\/object\/public\/(.+)$/);
      if (pathMatch && bucket) {
        trimmed = firebasePublicUrl(bucket, pathMatch[1]!);
      }
      break;
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const filename = trimmed.split('/').pop()?.split('?')[0] || '';
    if (PLACEHOLDER_FILENAMES.has(filename) && !trimmed.includes('firebasestorage.googleapis.com')) {
      return null;
    }
    return trimmed;
  }

  if (trimmed.startsWith('gs://') || trimmed.includes('firebasestorage.googleapis.com')) {
    return trimmed;
  }

  const clean = trimmed.replace(/^\/+/, '');
  if (PLACEHOLDER_FILENAMES.has(clean)) return null;

  if (bucket && /^(avatars|media|stories|messages|posts|clips|dm-media)\//i.test(clean)) {
    return firebasePublicUrl(bucket, clean);
  }

  if (bucket && /\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)(\?|$)/i.test(clean)) {
    return firebasePublicUrl(bucket, `media/${clean}`);
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
