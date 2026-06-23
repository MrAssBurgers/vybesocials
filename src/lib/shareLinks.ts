/**
 * Shareable URLs for posts and profiles.
 *
 * Prefers Firebase sharePreview Cloud Function (OG cards) when configured.
 * Falls back to vybehub.app deep links.
 */
import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/firebase/config';

const APP_ORIGIN = 'https://vybehub.app';

function sharePreviewBase(): string | null {
  try {
    if (!isFirebaseConfigured()) return null;
    const { projectId, functionsRegion } = getFirebaseConfig();
    return `https://${functionsRegion}-${projectId}.cloudfunctions.net/sharePreview`;
  } catch {
    return null;
  }
}

export function buildPostShareUrl(postId: string): string {
  const preview = sharePreviewBase();
  if (preview) {
    return `${preview}?postId=${encodeURIComponent(postId)}`;
  }
  return `${APP_ORIGIN}/p/${encodeURIComponent(postId)}`;
}

export function buildProfileShareUrl(username: string): string {
  const preview = sharePreviewBase();
  if (preview) {
    return `${preview}?type=profile&username=${encodeURIComponent(username)}`;
  }
  return `${APP_ORIGIN}/u/${encodeURIComponent(username)}`;
}
