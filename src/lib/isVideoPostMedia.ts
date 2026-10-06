/** Admitted post type survives extensionless Storage URLs and signed links. */
export function isVideoPostMedia(post: { type?: string; media_url?: string | null }): boolean {
  if (post.type) return post.type === 'short' || post.type === 'video';
  // Compatibility for older card inputs that do not include a post type.
  try {
    return /\.(mp4|webm|mov|m4v|ogv)$/i.test(decodeURIComponent(new URL(post.media_url || '', 'https://vybehub.app').pathname));
  } catch { return false; }
}
