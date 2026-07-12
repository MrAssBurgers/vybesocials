import type { QueryClient } from '@tanstack/react-query';
import { safeDmMembers } from '@/lib/persistedCollections';

/** Invalidate both legacy and DM list caches (mobile + desktop stay in sync). */
export function invalidateConversationCaches(
  queryClient: QueryClient,
  profileId?: string | null,
): void {
  if (profileId) {
    queryClient.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    queryClient.invalidateQueries({ queryKey: ['conversations', profileId] });
    return;
  }
  queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
}

type EmbeddedProfile = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
};

/** Patch embedded member profiles in list caches — avoids refetching every DM row. */
export function patchEmbeddedProfileInCaches(
  queryClient: QueryClient,
  profileId: string,
  patch: EmbeddedProfile,
): void {
  const apply = <T extends { members?: unknown }>(old: T[] | undefined): T[] | undefined => {
    if (!old?.length) return old;
    let changed = false;
    const next = old.map((conv) => {
      const members = safeDmMembers(conv.members);
      if (!members.length) return conv;
      let rowChanged = false;
      const updatedMembers = members.map((member) => {
        const pid = member.profile?.id ?? member.user_id;
        if (pid !== profileId) return member;
        rowChanged = true;
        return {
          ...member,
          profile: member.profile
            ? { ...member.profile, ...patch }
            : { id: profileId, ...patch },
        };
      });
      if (!rowChanged) return conv;
      changed = true;
      return { ...conv, members: updatedMembers };
    });
    return changed ? next : old;
  };

  queryClient.setQueriesData<T[]>({ queryKey: ['dm-conversations'] }, apply);
  queryClient.setQueriesData<T[]>({ queryKey: ['conversations'] }, apply);
}

/** Patch author fields on cached post arrays (feed cards) without full invalidation. */
export function patchAuthorOnPostCaches(
  queryClient: QueryClient,
  authorId: string,
  patch: EmbeddedProfile,
): void {
  const apply = (old: unknown) => {
    if (!Array.isArray(old)) return old;
    let changed = false;
    const next = old.map((post: { author?: EmbeddedProfile; author_id?: string }) => {
      const pid = post.author?.id ?? post.author_id;
      if (pid !== authorId || !post.author) return post;
      changed = true;
      return { ...post, author: { ...post.author, ...patch } };
    });
    return changed ? next : old;
  };

  for (const key of ['posts', 'infinite-posts', 'following-posts', 'personalized-feed', 'personalized-feed-v2'] as const) {
    queryClient.setQueriesData({ queryKey: [key] }, apply);
  }
}

/** Optimistically patch both list caches with the same updater. */
export function patchConversationListCaches<T>(
  queryClient: QueryClient,
  profileId: string,
  patch: (old: T[] | undefined) => T[] | undefined,
): void {
  queryClient.setQueryData(['dm-conversations', profileId], patch);
  queryClient.setQueryData(['conversations', profileId], patch);
}
