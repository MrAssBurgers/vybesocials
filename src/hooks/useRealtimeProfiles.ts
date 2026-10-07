import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import {
  patchAuthorOnPostCaches,
  patchEmbeddedProfileInCaches,
} from '@/lib/invalidateConversationCaches';
import { ownProfileRealtimeFilter } from '@/lib/signedInListenScope';

type DisplayFields = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

function displayFields(profile: DisplayFields | undefined) {
  return {
    username: profile?.username ?? null,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };
}

/**
 * Subscribes to the signed-in member's profile and patches cached display
 * fields when the username, name, or photo changes.
 *
 * Do not listen to the profiles collection. Rules allow any signed-in member
 * to read it, and a presence heartbeat writes `last_active_at` on each profile.
 * A collection listener downloads every profile and then treats each heartbeat
 * as a display change because the realtime payload's `old` row is empty.
 */
export function useRealtimeProfiles() {
  const queryClient = useQueryClient();
  const { user, authReady } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authReady || !user?.id) return;
    const userId = user.id;

    const channel = subscribePostgresChannel('profiles-realtime', [
      {
        event: 'UPDATE',
        table: 'profiles',
        filter: ownProfileRealtimeFilter(userId),
        callback: (payload) => {
          const updatedProfile = payload.new as DisplayFields & { id?: string; username?: string };
          const updatedProfileId = updatedProfile?.id;
          if (!updatedProfileId) return;

          const cached = (queryClient.getQueryData(['profile', updatedProfileId])
            ?? queryClient.getQueryData(['user-profile', updatedProfileId])) as DisplayFields | undefined;
          if (!cached) return;

          const previous = displayFields(cached);
          const next = displayFields(updatedProfile);
          const usernameChanged = previous.username !== next.username;
          const displayNameChanged = previous.display_name !== next.display_name;
          const avatarChanged = previous.avatar_url !== next.avatar_url;
          if (!usernameChanged && !displayNameChanged && !avatarChanged) return;

          const merge = (old: DisplayFields | undefined) => (old ? { ...old, ...updatedProfile } : old);
          queryClient.setQueryData(['profile', updatedProfileId], merge);
          queryClient.setQueryData(['user-profile', updatedProfileId], merge);

          const patch = { id: updatedProfileId, ...next };
          patchEmbeddedProfileInCaches(queryClient, updatedProfileId, patch);
          patchAuthorOnPostCaches(queryClient, updatedProfileId, patch);
          if (usernameChanged && next.username) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['profile', next.username] });
            }, 500);
          }
        },
      },
    ]);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      removeRealtimeChannel(channel);
    };
  }, [authReady, user?.id, queryClient]);
}
