import { db } from '@/lib/firebase';
import type { ReportAccountGuard } from '@/lib/reportModerationService';

type FlagReference = { content_type?: unknown; content_id?: unknown };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const postTypes = new Set(['post', 'clip', 'short', 'video', 'image']);

export function hasContentFlagContext(flag: FlagReference) {
  return validId(flag.content_id) && typeof flag.content_type === 'string'
    && (postTypes.has(flag.content_type) || ['profile', 'comment', 'mini_app'].includes(flag.content_type));
}

/** Legacy references are unverified leads. Destination pages still enforce
 * their normal access checks; never load private message context here. */
export async function contentFlagContextPath(flag: FlagReference, guard: ReportAccountGuard): Promise<string | null> {
  guard();
  if (!hasContentFlagContext(flag)) return null;
  const id = flag.content_id as string;
  if (postTypes.has(flag.content_type as string)) return `/p/${encodeURIComponent(id)}`;
  if (flag.content_type === 'mini_app') return `/mini-apps/${encodeURIComponent(id)}`;
  if (flag.content_type === 'comment') {
    const { data, error } = await db.from('comments').select('post_id').eq('id', id).maybeSingle();
    guard();
    if (error) throw error;
    return validId(data?.post_id) ? `/p/${encodeURIComponent(data.post_id)}#comment-${encodeURIComponent(id)}` : null;
  }
  const { data: byId, error } = await db.from('profiles').select('id, username').eq('id', id).maybeSingle();
  guard();
  if (error) throw error;
  let profile = byId;
  if (!profile) {
    const result = await db.from('profiles').select('id, username').eq('user_id', id).limit(2);
    guard();
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || result.data.length !== 1) return null;
    profile = result.data[0];
  }
  return typeof profile?.username === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(profile.username)
    ? `/u/${encodeURIComponent(profile.username)}` : null;
}
