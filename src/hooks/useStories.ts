import { listVerifiedCloseFriends, changeVerifiedCloseFriend } from '@/lib/closeFriendsService';
import { useStoryAccount } from './useStoryAccount';
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';
import { publishStory, type StoryPublishParams } from '@/lib/storyPublishService';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

import { listVisibleStories } from '@/lib/storyReadService';
import { storiesQueryKey, isStorySessionCurrent } from '@/lib/storiesQueryKey';

export interface Story {
  id: string;
  author_id: string;
  media_url: string;
  media_type: string;
  thumbnail_url?: string | null;
  caption: string | null;
  is_close_friends_only: boolean;
  view_count: number;
  expires_at: string;
  created_at: string;
  aspect_ratio?: number;
  duration?: number | null;
  author?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  has_viewed?: boolean;
  // For optimistic UI
  isOptimistic?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
}

export interface StoryGroup {
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
    equipped_profile_theme?: string | null;
  };
  stories: Story[];
  hasUnviewed: boolean;
}

const EMPTY_STORIES: StoryGroup[] = [];

/** Fresh server audience checks govern every page, including profile story rings. */
export function useStories(authorId?: string) {
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const profileId = profile?.user_id === user?.id ? profile?.id : undefined;
  const ready = !!user?.id && !!profileId && session.uid === user.id;
  const guard = reportAccountGuard(ready ? user.id : '');
  const query = useInfiniteQuery({
    queryKey: authorId ? ['story-author', authorId, profileId, session.uid, session.epoch] : storiesQueryKey(profileId, session),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      guard();
      const page = await listVisibleStories({ expectedOwnerUid: user!.id, expectedProfileId: profileId!,
        ...(authorId ? { authorId } : pageParam ? { cursor: pageParam } : {}) }, guard);
      const { data: views, error } = await db.from('story_views').select('story_id').eq('viewer_id', profileId!);
      guard();
      // View markers are cosmetic. An unavailable marker read must not widen audiences.
      const viewed = new Set(!error ? (views || []).map(row => row.story_id) : []);
      return { ...page, stories: page.stories.map(row => ({ ...row, has_viewed: row.author_id === profileId || viewed.has(row.id) })) };
    },
    getNextPageParam: page => page.nextCursor || undefined,
    enabled: ready,
    placeholderData: undefined,
    retry: false, gcTime: 0, staleTime: 0, networkMode: 'always',
    refetchInterval: 15_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (!ready) return;
    const resume = () => { if (isStorySessionCurrent(session)) void query.refetch(); };
    window.addEventListener('app-resumed', resume);
    return () => window.removeEventListener('app-resumed', resume);
  }, [ready, session, query.refetch]);
  const data = useMemo(() => {
    if (!ready || !isStorySessionCurrent(session) || query.isError || !query.data) return EMPTY_STORIES;
    const groups = new Map<string, StoryGroup>();
    const seen = new Set<string>();
    for (const page of query.data.pages) for (const story of page.stories) {
      if (seen.has(story.id) || Date.parse(story.expires_at) <= Date.now()) continue;
      seen.add(story.id);
      let group = groups.get(story.author_id);
      if (!group) { group = { user: story.author!, stories: [], hasUnviewed: false }; groups.set(story.author_id, group); }
      group.stories.push(story); if (!story.has_viewed) group.hasUnviewed = true;
    }
    return [...groups.values()].sort((a, b) => a.user.id === profileId ? -1 : b.user.id === profileId ? 1 : Number(b.hasUnviewed) - Number(a.hasUnviewed));
  }, [query.data, query.isError, ready, session, profileId]);
  return { ...query, data, isLoading: !ready || query.isLoading };
}

export type CreateStoryParams = StoryPublishParams;
type StoryPages = { pages: Array<{ stories: Story[]; nextCursor: string | null }>; pageParams: Array<string | null> };

export function useCreateStory() {
  const { user, profile } = useAuth();
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  const queryClient = useQueryClient();
  const boundGuard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const lifetime = useRef({ mounted: true });
  useEffect(() => { const active = lifetime.current; active.mounted = true; return () => { active.mounted = false; }; }, []);

  return useMutation({
    mutationFn: async (input: CreateStoryParams): Promise<Story> => {
      const guard = () => {
        boundGuard(); input.accountGuard?.();
        if (!lifetime.current.mounted || input.expectedOwnerUid !== user?.id) throw Object.assign(new Error('Your account changed. Open this story draft again.'), { code: 'account-changed' });
      };
      guard();
      const authorId = await resolveStoryAuthorProfileId(profileId ?? profile?.id);
      guard();
      const key = storiesQueryKey(authorId, session);
      const optimisticId = `optimistic-story-${input.requestId}`;
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      guard();
      const author = { id: authorId, username: profile?.username || 'You', avatar_url: profile?.avatar_url || null, display_name: profile?.display_name || null };
      const optimistic: Story = { id: optimisticId, author_id: authorId, media_url: input.mediaUrl, media_type: input.mediaType,
        thumbnail_url: input.thumbnailUrl || null, caption: input.caption || null, is_close_friends_only: !!input.isCloseFriendsOnly,
        aspect_ratio: input.aspectRatio, duration: input.duration, view_count: 0, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(), author, has_viewed: true, isOptimistic: true, isUploading: true };
      const removeOptimistic = (old: StoryPages | undefined) => old ? { ...old, pages: old.pages.map(page => ({ ...page,
        stories: page.stories.filter(story => story.id !== optimisticId),
      })) } : old;
      const putStory = (story: Story) => queryClient.setQueryData<StoryPages>(key, old => {
        const data = removeOptimistic(old) || { pages: [{ stories: [], nextCursor: null }], pageParams: [null] };
        return { ...data, pages: data.pages.map((page, index) => ({ ...page,
          stories: [...(index === 0 ? [story] : []), ...page.stories.filter(item => item.id !== story.id)],
        })) };
      });
      putStory(optimistic);
      try {
        const result = await publishStory({ ...input, authorId, accountGuard: guard });
        guard();
        const story = { ...result.story, has_viewed: true, isOptimistic: false, isUploading: false };
        putStory(story);
        void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'active' });
        return story;
      } catch (error) {
        try { guard(); queryClient.setQueryData<StoryPages>(key, removeOptimistic); } catch { /* Old sessions never restore cache. */ }
        throw error;
      }
    },
  });
}

export function useViewStory() {
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const queryClient = useQueryClient();
  const boundGuard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const key = storiesQueryKey(profile?.id, session);
  const guard = () => { boundGuard(); if (!profile?.id || profile.user_id !== user?.id) throw new Error('Your story account is not ready.'); };

  return useMutation({
    mutationFn: async (storyId: string) => {
      guard();

      const { error } = await db
        .from('story_views')
        .upsert(
          {
            story_id: storyId,
            viewer_id: profile!.id,
          },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        );

      guard(); if (error) throw error;
    },
    onMutate: async (storyId) => {
      guard(); await queryClient.cancelQueries({ queryKey: key, exact: true }); guard();
      const previous = queryClient.getQueryData<StoryPages>(key)?.pages.flatMap(page => page.stories).find(story => story.id === storyId)?.has_viewed;
      queryClient.setQueryData<StoryPages>(key, old => old ? { ...old, pages: old.pages.map(page => ({ ...page,
        stories: page.stories.map(story => story.id === storyId ? { ...story, has_viewed: true } : story),
      })) } : old);
      return { previous, guard, key };
    },
    onError: (err, storyId, context) => {
      if (!context) return;
      try { context.guard(); } catch { return; }
      queryClient.setQueryData<StoryPages>(context.key, old => old ? { ...old, pages: old.pages.map(page => ({ ...page,
        stories: page.stories.map(story => story.id === storyId ? { ...story, has_viewed: context.previous } : story),
      })) } : old);
    },
    onSettled: () => {
      // Don't refetch immediately - allow UI to show viewed state
      // Refetch on next interval
    },
  });
}

export function useCloseFriends() {
  const { user, profile, session, ready, guard } = useStoryAccount();
  const query = useInfiniteQuery({
    queryKey: ['close-friends', profile?.id, session.uid, session.epoch],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listVerifiedCloseFriends({ expectedOwnerUid: user!.id, expectedProfileId: profile!.id,
      ...(pageParam ? { cursor: pageParam } : {}) }, guard),
    getNextPageParam: page => page.candidateNextCursor || undefined,
    enabled: ready, retry: false, gcTime: 0, staleTime: 0, networkMode: 'always', placeholderData: undefined,
    refetchInterval: 15_000, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  });
  const current = ready && isStorySessionCurrent(session) && !query.isError;
  const last = query.data?.pages.at(-1);
  const candidates = useMemo(() => {
    if (!current || !query.data) return [];
    return [...new Map(query.data.pages.flatMap(page => page.candidates).map(friend => [friend.id, friend])).values()];
  }, [current, query.data]);
  return { ...query, data: current ? last?.friends : undefined, candidates, legacyReview: current && last?.legacyReview === true,
    isLoading: !ready || query.isLoading, isFetched: ready && !query.isError && query.isFetched };
}

export function useManageCloseFriend() {
  const { user, profile, session, guard } = useStoryAccount();
  const queryClient = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const check = () => { guard(); if (!alive.current) throw new Error('This view has closed.'); };
  return useMutation({
    mutationFn: async ({ friendId, action }: { friendId: string; action: 'add' | 'remove' }) => {
      check();
      const result = await changeVerifiedCloseFriend({ action, friendId, expectedOwnerUid: user!.id, expectedProfileId: profile!.id }, check);
      check();
      return { result, guard: check, session };
    },
    onSuccess: result => {
      result.guard();
      void queryClient.invalidateQueries({ queryKey: ['close-friends', profile!.id, result.session.uid, result.session.epoch], exact: true });
      void queryClient.invalidateQueries({ queryKey: storiesQueryKey(profile!.id, result.session), exact: true });
    },
  });
}
