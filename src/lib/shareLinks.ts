/**
 * Shareable URLs for posts and profiles.
 * People copy https://vybehub.app/u/{username} and /p/{postId}.
 * The sharePreview function still renders cards for older links.
 */
const APP_ORIGIN = 'https://vybehub.app';

export function buildPostShareUrl(postId: string): string {
  return `${APP_ORIGIN}/p/${encodeURIComponent(postId)}`;
}

export function buildProfileShareUrl(username: string): string {
  const handle = username.trim().replace(/^@+/, '');
  return `${APP_ORIGIN}/u/${encodeURIComponent(handle)}`;
}
