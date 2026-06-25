import type { QueryClient } from '@tanstack/react-query';
import type { StoryGroup } from '@/hooks/useStories';
import { ensureArray } from '@/lib/persistedCollections';

function normalizeStoryGroup(group: StoryGroup | null | undefined): StoryGroup | null {
  if (!group || typeof group !== 'object') return null;
  const userId = group.user?.id;
  if (!userId || typeof userId !== 'string') return null;
  const stories = ensureArray(group.stories).filter(
    (story) => story && typeof story === 'object' && typeof story.id === 'string',
  );
  return {
    ...group,
    user: group.user ?? {
      id: userId,
      username: `user_${userId.slice(0, 8)}`,
      avatar_url: null,
      display_name: null,
      equipped_profile_theme: null,
    },
    stories,
    hasUnviewed: Boolean(group.hasUnviewed),
  };
}

/** Rehydrated cache can deserialize story arrays as `{}` — normalize before any `.filter`/`.forEach`. */
export function normalizeStoryGroups(groups: unknown): StoryGroup[] {
  return ensureArray<StoryGroup>(groups)
    .map((group) => normalizeStoryGroup(group))
    .filter((group): group is StoryGroup => group !== null && group.stories.length > 0);
}

/** Optimistic story rows must never survive reload — they block new posts. */
export function stripUploadingStories(groups: StoryGroup[] | undefined): StoryGroup[] | undefined {
  const normalized = normalizeStoryGroups(groups);
  if (!normalized.length) return normalized.length ? normalized : [];

  const cleaned = normalized
    .map((group) => ({
      ...group,
      stories: group.stories.filter((story) => !story.isOptimistic && !story.isUploading),
    }))
    .filter((group) => group.stories.length > 0);

  return cleaned.length ? cleaned : [];
}

export function isStoriesQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'stories';
}

export function sanitizeStoriesCacheData(data: unknown): unknown {
  return stripUploadingStories(normalizeStoryGroups(data)) ?? [];
}

export function purgeStuckStoryUploads(queryClient: QueryClient, profileId?: string | null): void {
  const keys = profileId
    ? [['stories', profileId] as const]
    : queryClient
        .getQueryCache()
        .findAll({ predicate: (q) => isStoriesQueryKey(q.queryKey) })
        .map((q) => q.queryKey);

  for (const key of keys) {
    queryClient.setQueryData<StoryGroup[] | undefined>(key, (old) => {
      const next = stripUploadingStories(old);
      return next?.length ? next : undefined;
    });
  }
}
