import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { storiesQueryKey, isStorySessionCurrent } from './storiesQueryKey';
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

export function purgeStuckStoryUploads(queryClient: QueryClient, profileId?: string | null, session: ReportAccountSession = reportAccountSnapshot()): void {
  if (!isStorySessionCurrent(session)) return;
  const keys = profileId ? [storiesQueryKey(profileId, session)] : queryClient.getQueryCache()
    .findAll({ predicate: q => isStoriesQueryKey(q.queryKey) && q.queryKey[2] === session.uid && q.queryKey[3] === session.epoch }).map(q => q.queryKey);
  for (const key of keys) {
    queryClient.setQueryData<{ pages: { stories: { isOptimistic?: boolean; isUploading?: boolean; created_at?: string }[]; nextCursor: string | null }[]; pageParams: unknown[] }>(key, old => {
      if (!old || !Array.isArray(old.pages)) return old;
      // A separate StoriesBar mutation observer cannot determine whether the
      // actual composer is saving. Only remove genuinely stale optimistic rows.
      const cutoff = Date.now() - 5 * 60_000;
      return { ...old, pages: old.pages.map(page => ({ ...page, stories: page.stories.filter(story =>
        !(story.isOptimistic || story.isUploading) || Date.parse(story.created_at || '') > cutoff) })) };
    });
  }
}
