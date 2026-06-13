import { supabase } from '@/integrations/supabase/client';
import {
  getEffectiveProfileId,
  setCachedCurrentProfile,
  type CachedProfile,
} from '@/lib/profileCache';

let memoAuthUserId: string | null = null;
let memoProfileId: string | null = null;
let inflight: Promise<string | undefined> | null = null;

/** Sync profile id — live auth state or disk cache (instant). */
export function syncSessionProfileId(liveProfileId?: string | null): string | undefined {
  return getEffectiveProfileId(liveProfileId);
}

/** One session-scoped profile lookup; deduped across DMs/messages/chat. */
export async function resolveSessionProfileId(
  liveProfileId?: string | null,
): Promise<string | undefined> {
  const cached = getEffectiveProfileId(liveProfileId);
  if (cached) return cached;

  const { data: { session } } = await supabase.auth.getSession();
  const authUserId = session?.user?.id;
  if (!authUserId) return undefined;

  if (memoAuthUserId === authUserId && memoProfileId) return memoProfileId;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .eq('user_id', authUserId)
        .maybeSingle();

      if (error || !data?.id) return undefined;

      memoAuthUserId = authUserId;
      memoProfileId = data.id;

      const payload: CachedProfile = {
        id: data.id,
        user_id: data.user_id,
        username: data.username,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
      };
      setCachedCurrentProfile(payload);
      return data.id;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Clear memo when auth user changes (call from AuthProvider if needed). */
export function resetSessionProfileMemo(): void {
  memoAuthUserId = null;
  memoProfileId = null;
  inflight = null;
}
