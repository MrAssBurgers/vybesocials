import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { prefetchDMConversations } from '@/lib/loadDMConversations';
import { setCachedUserLevel } from '@/lib/userLevelCache';
import { signAndPreloadProfileAvatar } from '@/lib/imagePreload';
import { warmOwnProfilePosts } from '@/lib/warmOwnProfilePosts';

// Feed content is loaded only by the visible account-bound reader. Boot warming
// must not revive legacy raw posts or start their media downloads.

// Private story media is loaded by the mounted, account-scoped story reader.
// Boot warming cannot infer current friendship/close-friend authority.

function warmNotifications(queryClient: QueryClient, profileId: string) {
  const key = ['notifications', profileId] as const;
  if (queryClient.getQueryData(key)) return;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  void db
    .from('notifications')
    .select(`*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
    .eq('user_id', profileId)
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })
    .limit(15)
    .then(({ data }) => {
      if (data) queryClient.setQueryData(key, data);
    });
}

function warmUserMeta(queryClient: QueryClient, uid: string, profileId: string) {
  void Promise.allSettled([
    db
      .from('user_preferences' as any)
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        const prefsRow = data as any;
        if (prefsRow) {
          queryClient.setQueryData(['user-preferences', uid], {
            clips_muted: prefsRow.clips_muted ?? true,
            explore_view_mode: prefsRow.explore_view_mode ?? 'clips',
            button_sound: prefsRow.button_sound ?? 'pop',
            dismissed_quick_add_ids: prefsRow.dismissed_quick_add_ids ?? [],
            unlocked_easter_eggs: prefsRow.unlocked_easter_eggs ?? [],
            intro_completed: prefsRow.intro_completed ?? false,
            referral_confirmed: prefsRow.referral_confirmed ?? false,
            extra: prefsRow.extra ?? {},
          });
        }
      }),
    db
      .from('user_levels')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(async ({ data: levelRow }) => {
        if (levelRow) {
          const normalized = {
            ...levelRow,
            unclaimed_rewards: Array.isArray(levelRow.unclaimed_rewards) ? levelRow.unclaimed_rewards : [],
          };
          queryClient.setQueryData(['user-level', uid], normalized);
          setCachedUserLevel(uid, {
            current_level: levelRow.current_level,
            total_xp: levelRow.total_xp,
            unclaimed_rewards: normalized.unclaimed_rewards,
          });
          return;
        }
        await db.rpc('ensure_user_level');
        const { data: retryRow } = await db
          .from('user_levels')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();
        if (retryRow) {
          queryClient.setQueryData(['user-level', uid], retryRow);
          setCachedUserLevel(uid, {
            current_level: retryRow.current_level,
            total_xp: retryRow.total_xp,
            unclaimed_rewards: Array.isArray(retryRow.unclaimed_rewards) ? retryRow.unclaimed_rewards : [],
          });
        }
      }),
    db
      .from('dna_agent_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data: dnaRow }) => {
        if (dnaRow) queryClient.setQueryData(['dna-agent-settings', uid], dnaRow);
      }),
  ]);
}

function signCachedProfileMedia() {
  const cached = getCachedCurrentProfile();
  if (!cached?.id) return;
  const avatar = resolveProfileAvatarUrl(cached.id, cached.avatar_url);
  if (avatar) void signAndPreloadProfileAvatar(avatar, 192);
}

/**
 * Single boot warm path — feeds, DMs, stories, notifications, user meta.
 * Safe to call multiple times; skips keys that already have cache.
 */
export function warmHomeCachesForProfile(
  queryClient: QueryClient,
  uid: string,
  profileId: string,
  profileRow?: Record<string, unknown> | null,
) {
  if (profileRow) {
    queryClient.setQueryData(['profile', profileId], profileRow);
    const uname = String(profileRow.username || '').toLowerCase();
    if (uname) {
      queryClient.setQueryData(['profile', uname], profileRow);
    }
    const avatar = resolveProfileAvatarUrl(
      profileId,
      (profileRow.avatar_url as string | null | undefined) ?? null,
    );
    if (avatar) void signAndPreloadProfileAvatar(avatar, 192);
  }

  signCachedProfileMedia();
  void prefetchDMConversations(queryClient, profileId, uid);
  warmOwnProfilePosts(uid, profileId);
  warmNotifications(queryClient, profileId);
  warmUserMeta(queryClient, uid, profileId);
}

/**
 * Resolve session + profile, then warm all home caches (non-blocking).
 */
export async function warmHomeCaches(queryClient: QueryClient): Promise<void> {
  try {
    signCachedProfileMedia();

    const cached = getCachedCurrentProfile();
    if (cached?.id) {
      const { data: { session } } = await db.auth.getSession();
      const uid = session?.user?.id || cached.user_id || '';
      if (uid) {
        warmHomeCachesForProfile(queryClient, uid, cached.id, {
          id: cached.id,
          user_id: uid,
          username: cached.username,
          display_name: cached.display_name,
          avatar_url: cached.avatar_url,
          bio: cached.bio || '',
        });
        if (session?.user) return;
      }
    }

    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;
    const uid = session.user.id;

    if (cached?.id) {
      warmHomeCachesForProfile(queryClient, uid, cached.id);
      return;
    }

    const { data: profileData } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    if (profileData?.id) {
      warmHomeCachesForProfile(queryClient, uid, profileData.id, profileData);
    }
  } catch {
    /* non-blocking */
  }
}
