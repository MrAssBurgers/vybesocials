/**
 * Dual Supabase: agtcyx (legacy read + auth) · hprmic (new writes).
 */
import { supabase } from '@/integrations/supabase/client';
import { hprmicSupabase } from '@/integrations/supabase/hprmicClient';
import { normalizeLoginEmail } from '@/lib/loginEmail';

const PROFILE_MAP_KEY = 'vybe-hprmic-profile-map';

type ProfileMap = Record<string, string>;

let memoHprmicProfileId: string | null = null;
let memoLegacyProfileId: string | null = null;
let hprmicAuthInflight: Promise<boolean> | null = null;

export function getLegacyClient() {
  return supabase;
}

export function getNewWritesClient() {
  return hprmicSupabase;
}

function readProfileMap(): ProfileMap {
  try {
    const raw = sessionStorage.getItem(PROFILE_MAP_KEY);
    return raw ? (JSON.parse(raw) as ProfileMap) : {};
  } catch {
    return {};
  }
}

function writeProfileMap(map: ProfileMap): void {
  try {
    sessionStorage.setItem(PROFILE_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function mapLegacyToHprmicProfileId(legacyProfileId: string): string | undefined {
  if (memoLegacyProfileId === legacyProfileId && memoHprmicProfileId) {
    return memoHprmicProfileId;
  }
  return readProfileMap()[legacyProfileId];
}

function rememberProfileMapping(legacyProfileId: string, hprmicProfileId: string): void {
  memoLegacyProfileId = legacyProfileId;
  memoHprmicProfileId = hprmicProfileId;
  const map = readProfileMap();
  map[legacyProfileId] = hprmicProfileId;
  writeProfileMap(map);
}

export function clearHprmicSessionState(): void {
  memoHprmicProfileId = null;
  memoLegacyProfileId = null;
  hprmicAuthInflight = null;
  try {
    sessionStorage.removeItem(PROFILE_MAP_KEY);
  } catch {
    /* ignore */
  }
}

/** Mirror password login onto hprmic (separate auth DB). Best-effort, non-blocking for agtcyx login. */
export async function syncHprmicAuth(email: string, password: string): Promise<boolean> {
  if (hprmicAuthInflight) return hprmicAuthInflight;

  hprmicAuthInflight = (async () => {
    try {
      const normalized = normalizeLoginEmail(email);
      const { data: existing } = await hprmicSupabase.auth.getSession();
      if (existing.session?.user) return true;

      const { error: signInError } = await hprmicSupabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (!signInError) return true;

      const { error: signUpError } = await hprmicSupabase.auth.signUp({
        email: normalized,
        password,
      });
      if (signUpError) {
        console.warn('[dualSupabase] hprmic auth sync failed:', signUpError.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[dualSupabase] hprmic auth sync error:', err);
      return false;
    } finally {
      hprmicAuthInflight = null;
    }
  })();

  return hprmicAuthInflight;
}

/** Ensure hprmic profile row exists; returns hprmic profiles.id for inserts. */
export async function ensureHprmicWriteReady(
  legacyProfileId: string,
): Promise<string | null> {
  const cached = mapLegacyToHprmicProfileId(legacyProfileId);
  if (cached) return cached;

  const { data: sessionData } = await hprmicSupabase.auth.getSession();
  if (!sessionData.session?.user) return null;

  const authUserId = sessionData.session.user.id;

  const loadProfile = async () =>
    hprmicSupabase
      .from('profiles')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle();

  let { data: profileRow } = await loadProfile();

  if (!profileRow?.id) {
    const { data: ensuredId, error } = await hprmicSupabase.rpc('ensure_profile');
    if (!error && typeof ensuredId === 'string') {
      rememberProfileMapping(legacyProfileId, ensuredId);
      return ensuredId;
    }
    ({ data: profileRow } = await loadProfile());
  }

  if (!profileRow?.id) return null;

  rememberProfileMapping(legacyProfileId, profileRow.id);
  return profileRow.id;
}

export interface DualPostRow {
  id: string;
  type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  tags: string[] | null;
  created_at: string;
  is_pinned: boolean | null;
  author_id: string;
  author?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name?: string | null;
  } | null;
}

export function dualRowToFeedPost(row: DualPostRow, legacyAuthorId?: string) {
  const author = row.author;
  return {
    id: row.id,
    type: row.type,
    media_url: row.media_url || '',
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: !!row.is_pinned,
    author: {
      id: legacyAuthorId || author?.id || row.author_id,
      username: author?.username || 'user',
      avatar_url: author?.avatar_url ?? null,
    },
    like_count: 0,
    comment_count: 0,
    is_liked: false,
    is_bookmarked: false,
    reaction_type: null as string | null,
    view_count: 0,
  };
}

/** Fetch new posts from hprmic for the signed-in user (mapped profile). */
export async function fetchHprmicPostsForUser(
  legacyProfileId: string,
  options?: { type?: string; limit?: number; offset?: number },
): Promise<ReturnType<typeof dualRowToFeedPost>[]> {
  const hprmicProfileId = mapLegacyToHprmicProfileId(legacyProfileId);
  if (!hprmicProfileId) return [];

  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;

  let query = hprmicSupabase
    .from('posts')
    .select(
      'id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned, author_id, author:profiles!author_id(id, username, avatar_url, display_name)',
    )
    .eq('author_id', hprmicProfileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[dualSupabase] hprmic posts fetch failed:', error.message);
    return [];
  }

  return (data || []).map((row) => dualRowToFeedPost(row as DualPostRow, legacyProfileId));
}

export function mergeFeedPosts<T extends { id: string; created_at: string }>(
  legacyPosts: T[],
  hprmicPosts: T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const post of [...legacyPosts, ...hprmicPosts]) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }

  merged.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return merged;
}

export async function signOutHprmicLocal(): Promise<void> {
  clearHprmicSessionState();
  await hprmicSupabase.auth.signOut().catch(() => {});
}
