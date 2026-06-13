/**
 * Shareable URLs for posts and profiles.
 *
 * Prefers share-preview edge (OG cards for iMessage/Slack) when project ref is set.
 * Falls back to vybehub.app deep links if env is missing.
 */
const APP_ORIGIN = 'https://vybehub.app';
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

function sharePreviewBase(): string | null {
  if (!PROJECT_REF) return null;
  return `https://${PROJECT_REF}.supabase.co/functions/v1/share-preview`;
}

export function buildPostShareUrl(postId: string): string {
  const preview = sharePreviewBase();
  if (preview) {
    return `${preview}?type=post&id=${encodeURIComponent(postId)}`;
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
