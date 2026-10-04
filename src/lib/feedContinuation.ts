/** Stop automatic pagination if its latest page did not extend the visible list.
 * Raw cursors remain available for a deliberate manual continuation.
 */
export function latestPageAddsVisiblePosts(pages: readonly { posts: readonly { id: string }[] }[] | undefined): boolean {
  if (!pages?.length) return false;
  const seen = new Set(pages.slice(0, -1).flatMap(page => page.posts.map(post => post.id)));
  return pages[pages.length - 1].posts.some(post => !!post.id && !seen.has(post.id));
}
