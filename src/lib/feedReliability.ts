/** Preserve feed failures instead of turning denied or offline reads into empty feeds. */
export function toFeedError(value: unknown): Error & { code?: string } {
  if (value instanceof Error) return value;
  const details = value && typeof value === 'object'
    ? value as { message?: unknown; code?: unknown; name?: unknown }
    : {};
  const error = new Error(typeof details.message === 'string' ? details.message : 'The feed could not be loaded.');
  return Object.assign(error, {
    code: typeof details.code === 'string' ? details.code
      : typeof details.name === 'string' ? details.name : undefined,
  });
}

export async function readFeedResult<T>(read: () => Promise<T>): Promise<
  { data: T; error: null } | { data: null; error: Error & { code?: string } }
> {
  try { return { data: await read(), error: null }; }
  catch (error) { return { data: null, error: toFeedError(error) }; }
}

/** Use the received page size, not the visible size after local safety filters. */
export function hasMoreFeedRows(rows: unknown, pageSize: number): boolean {
  return Number.isInteger(pageSize) && pageSize > 0 && Array.isArray(rows) && rows.length >= pageSize;
}

/** Appending a page must not reshuffle clips the viewer has already reached. */
export function flattenUniqueFeedPosts<T extends { id: string }>(pages?: readonly { posts: readonly T[] }[]): T[] {
  const seen = new Set<string>();
  const posts: T[] = [];
  for (const page of pages ?? []) {
    for (const post of page.posts) {
      if (!post?.id || seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push(post);
    }
  }
  return posts;
}

/** Feed shortcuts must not consume typing, IME input, or dialog navigation. */
export function shouldHandleFeedShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  return !(target instanceof Element && target.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="combobox"],[role="listbox"]',
  ));
}

export function readFeedPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeFeedPreference(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Playback still works without persistent storage. */ }
}
