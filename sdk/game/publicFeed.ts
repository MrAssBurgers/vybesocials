export interface PublicFeedOptions { cursor?: string; contentType?: 'post' | 'short' | 'video'; signal?: AbortSignal }
export interface PublicFeedPost {
  id: string; type: 'post' | 'short' | 'video'; caption: string; createdAt: string;
  mediaUrl: string | null; mediaUrls: string[]; thumbnailUrl: string | null; ageRating: 'safe';
  likeCount: number; commentCount: number; viewCount: number; tags: string[];
  author: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}
export interface PublicFeedPage {
  connectionId: string; expiresAt: number; contentType: PublicFeedOptions['contentType'] | null;
  nextCursor: string | null; posts: PublicFeedPost[];
}

function assert(value: unknown): asserts value { if (!value) throw new Error('Invalid public feed'); }
function record(value: unknown, keys: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  const row = value as Record<string, unknown>, allowed = keys.split(' ');
  assert(Object.keys(row).length === allowed.length && allowed.every(key => Object.prototype.hasOwnProperty.call(row, key)));
  return row;
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }
function id(value: unknown) { return text(value, 1500) && value.length > 0 && !/[\s/]/.test(value); }
function url(value: unknown, nullable = true): boolean {
  if (nullable && value === null) return true;
  if (!text(value, 8192)) return false;
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; }
}

/** Validates and copies an untrusted API receipt; never grants access based on presentation data. */
export function parsePublicFeed(value: unknown, session: { connectionId: string; expiresAt: number }, options: PublicFeedOptions): PublicFeedPage {
  const page = record(value, 'connectionId expiresAt contentType nextCursor posts');
  // Token expiresIn is rounded down to whole seconds; never extend the local deadline.
  assert(page.connectionId === session.connectionId && Number.isSafeInteger(page.expiresAt)
    && Number(page.expiresAt) > Date.now() && Number(page.expiresAt) <= session.expiresAt + 1000
    && page.contentType === (options.contentType ?? null));
  assert(page.nextCursor === null || (typeof page.nextCursor === 'string' && /^[a-f0-9]{48}$/.test(page.nextCursor) && page.nextCursor !== options.cursor));
  assert(Array.isArray(page.posts) && page.posts.length <= 20);
  const seen = new Set<string>();
  const posts = page.posts.map(value => {
    const row = record(value, 'id type caption createdAt mediaUrl mediaUrls thumbnailUrl ageRating likeCount commentCount viewCount tags author');
    assert(id(row.id) && !seen.has(row.id as string)); seen.add(row.id as string);
    assert(['post', 'short', 'video'].includes(row.type as string) && (!options.contentType || row.type === options.contentType));
    assert(text(row.caption, 10000) && text(row.createdAt, 32) && /^\d{4}-\d\d-\d\dT/.test(row.createdAt) && Number.isFinite(Date.parse(row.createdAt)));
    assert(row.ageRating === 'safe' && url(row.mediaUrl) && url(row.thumbnailUrl));
    assert(row.mediaUrl !== null || (row.type === 'post' && (row.caption as string).trim().length > 0));
    assert(Array.isArray(row.mediaUrls) && row.mediaUrls.length <= 20 && row.mediaUrls.every(value => url(value, false)));
    assert(['likeCount', 'commentCount', 'viewCount'].every(key => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0));
    assert(Array.isArray(row.tags) && row.tags.length <= 30 && row.tags.every(value => text(value, 100)));
    const author = record(row.author, 'id username displayName avatarUrl');
    assert(id(author.id) && text(author.username, 100) && author.username.trim().length > 0
      && (author.displayName === null || text(author.displayName, 200)) && url(author.avatarUrl));
    return { ...row, mediaUrls: [...row.mediaUrls], tags: [...row.tags], author: { ...author } } as unknown as PublicFeedPost;
  });
  return { connectionId: session.connectionId, expiresAt: Math.min(Number(page.expiresAt), session.expiresAt), contentType: options.contentType ?? null, nextCursor: page.nextCursor as string | null, posts };
}
