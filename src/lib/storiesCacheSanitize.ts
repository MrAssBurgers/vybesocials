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

export function storyGroupsNeedRevive(groups: unknown): boolean {
  if (!Array.isArray(groups)) return groups != null && typeof groups === 'object';
  return groups.some((group) => {
    if (!group || typeof group !== 'object') return true;
    const stories = (group as StoryGroup).stories;
    if (stories != null && !Array.isArray(stories)) return true;
    const userId = (group as StoryGroup).user?.id;
    return !userId || typeof userId !== 'string';
  });
}

/** Rehydrated cache can deserialize story arrays as `{}` — normalize before any `.filter`/`.forEach`. */
export function normalizeStoryGroups(groups: unknown): StoryGroup[] {
  const rows = ensureArray<StoryGroup>(groups);
  if (!rows.length) return rows;
  if (!storyGroupsNeedRevive(rows)) return rows;
  return rows
    .map((group) => normalizeStoryGroup(group))
    .filter((group): group is StoryGroup => group !== null && group.stories.length > 0);
}

/** Optimistic story rows must never survive reload — they block new posts. */
export function stripUploadingStories(groups: StoryGroup[] | undefined): StoryGroup[] | undefined {
  if (!groups?.length) return groups?.length ? groups : [];

  const hasUploading = groups.some((group) =>
    group.stories?.some((story) => story.isOptimistic || story.isUploading),
  );
  if (!hasUploading) return groups;

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
  const normalized = normalizeStoryGroups(data);
  const stripped = stripUploadingStories(normalized);
  return stripped ?? [];
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
