import type { QueryClient } from '@tanstack/react-query';
import type { StoryGroup } from '@/hooks/useStories';

/** Optimistic story rows must never survive reload — they block new posts. */
export function stripUploadingStories(groups: StoryGroup[] | undefined): StoryGroup[] | undefined {
  if (!groups?.length) return groups;

  const cleaned = groups
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
  if (!Array.isArray(data)) return data;
  return stripUploadingStories(data as StoryGroup[]) ?? [];
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
