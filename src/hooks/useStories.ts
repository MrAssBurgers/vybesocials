import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { resolveSessionProfileId, resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';
import { resolveAuthorIds, fetchMemberProfiles } from '@/lib/dmMembershipRepair';
import { purgeStuckStoryUploads } from '@/lib/storiesCacheSanitize';

function storiesQueryProfileId(liveProfileId?: string | null, resolvedProfileId?: string) {
  return getEffectiveProfileId(liveProfileId ?? resolvedProfileId);
}

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

export function useStories() {
  const { profile } = useAuth();
  const resolvedProfileId = useAuthProfileId();
  const profileId = storiesQueryProfileId(profile?.id, resolvedProfileId);
  const queryClient = useQueryClient();

  useEffect(() => {
    purgeStuckStoryUploads(queryClient, profileId);
  }, [queryClient, profileId]);

  return useQuery({
    queryKey: ['stories', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // Get friends using friend_requests table (accepted requests)
      const { data: asSender } = await db
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', profileId)
        .eq('status', 'accepted');

      const { data: asReceiver } = await db
        .from('friend_requests')
        .select('sender_id')
        .eq('receiver_id', profileId)
        .eq('status', 'accepted');

      // Combine friend IDs
      const friendIds = new Set<string>([
        ...(asSender?.map(r => r.receiver_id) || []),
        ...(asReceiver?.map(r => r.sender_id) || []),
      ]);

      // Get non-expired stories - ONLY from friends and self
      const allowedIds = new Set<string>([profileId]);
      for (const fid of friendIds) {
        for (const id of await resolveAuthorIds(fid)) allowedIds.add(id);
      }

      const idList = [...allowedIds];
      const storyRows: Record<string, unknown>[] = [];
      for (let i = 0; i < idList.length; i += 10) {
        const chunk = idList.slice(i, i + 10);
        const { data: chunkRows, error } = await db
          .from('stories')
          .select(`
            *,
            author:profiles!author_id(id, username, avatar_url, display_name, equipped_profile_theme)
          `)
          .in('author_id', chunk)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });
        if (error) throw error;
        storyRows.push(...(chunkRows || []));
      }

      const data = storyRows;

      const { data: views } = await db
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', profileId);

      const viewedIds = new Set(views?.map((v) => v.story_id) || []);

      const baseStories = (data || []).map((story) => ({
        ...story,
        has_viewed: viewedIds.has(story.id),
      }));

      const storiesWithViews = baseStories;

      const groupedMap = new Map<string, StoryGroup>();

      for (const story of storiesWithViews) {
        const authorId = (story as any).author_id;
        const authorRow = (story as any).author as StoryGroup['user'] | null;

        if (!groupedMap.has(authorId)) {
          groupedMap.set(authorId, {
            user: authorRow || {
              id: authorId,
              username: `user_${String(authorId).slice(0, 8)}`,
              avatar_url: null,
              display_name: null,
              equipped_profile_theme: null,
            },
            stories: [],
            hasUnviewed: false,
          });
        }
        const group = groupedMap.get(authorId)!;
        group.stories.push(story as Story);
        if (!story.has_viewed) {
          group.hasUnviewed = true;
        }
      }

      // Sort: own stories first, then friends with unviewed, then viewed
      const groups = Array.from(groupedMap.values());

      // Enrich missing authors + equipped themes (author_id may be auth uid).
      const missingAuthorKeys = groups
        .filter((g) => !g.user.username || g.user.username.startsWith('user_'))
        .map((g) => g.user.id);
      if (missingAuthorKeys.length) {
        const profileMap = await fetchMemberProfiles(missingAuthorKeys);
        for (const group of groups) {
          const prof = profileMap.get(group.user.id);
          if (prof) {
            group.user = {
              id: String(prof.id),
              username: String(prof.username || group.user.username),
              avatar_url: (prof.avatar_url as string | null) ?? null,
              display_name: (prof.display_name as string | null) ?? null,
              equipped_profile_theme: (prof.equipped_profile_theme as string | null) ?? group.user.equipped_profile_theme ?? null,
            };
          }
        }
      }

      groups.sort((a, b) => {
        // Own stories first
        if (a.user.id === profileId) return -1;
        if (b.user.id === profileId) return 1;
        
        // Within friends, unviewed before viewed
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        
        return 0;
      });

      return groups;
    },
    enabled: !!profileId,
    staleTime: 2 * 60 * 1000, // 2 minute cache
    gcTime: 30 * 60 * 1000, // 30 min garbage collection
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

interface CreateStoryParams {
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  caption?: string;
  isCloseFriendsOnly?: boolean;
  aspectRatio?: number;
  duration?: number | null;
  pollData?: { type: string; question: string; options: string[] };
}

export function useCreateStory() {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const storiesProfileId = getEffectiveProfileId(profileId ?? profile?.id);

  return useMutation({
    mutationFn: async ({
      mediaUrl,
      mediaType,
      thumbnailUrl,
      caption,
      isCloseFriendsOnly,
      aspectRatio,
      duration,
      pollData,
    }: CreateStoryParams) => {
      const authorId = await resolveStoryAuthorProfileId(profileId ?? profile?.id);
      if (!authorId) throw new Error('Not authenticated');

      const payload = {
        author_id: authorId,
        media_url: mediaUrl,
        media_type: mediaType,
        thumbnail_url: thumbnailUrl || null,
        caption,
        is_close_friends_only: isCloseFriendsOnly || false,
        aspect_ratio: aspectRatio || 0.5625,
        duration: duration,
        poll_data: pollData || null,
        view_count: 0,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const storySelect = `
          *,
          author:profiles!author_id(id, username, avatar_url, display_name)
        `;

      let { data, error } = await (db.from('stories') as any)
        .insert(payload)
        .select(storySelect)
        .maybeSingle();

      // Prod may lag migrations — retry without poll_data if column missing.
      if (error && pollData && /poll_data|column/i.test(error.message || '')) {
        const { poll_data: _omit, ...withoutPoll } = payload;
        ({ data, error } = await (db.from('stories') as any)
          .insert(withoutPoll)
          .select(storySelect)
          .maybeSingle());
      }

      if (error) {
        const msg = error.message || '';
        if (/row-level security|policy|42501/i.test(msg)) {
          throw new Error('Story save blocked by permissions. Sign out and back in, then try again.');
        }
        if (/author_id|foreign key|violates foreign key/i.test(msg)) {
          throw new Error('Could not link story to your profile. Sign out and back in, then try again.');
        }
        throw error;
      }

      if (!data) {
        const { data: latest, error: fetchError } = await (db.from('stories') as any)
          .select(`
            *,
            author:profiles!author_id(id, username, avatar_url, display_name)
          `)
          .eq('author_id', authorId)
          .eq('media_url', mediaUrl)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!latest) {
          throw new Error('Story may have saved but could not be confirmed. Refresh Home and check your story ring.');
        }
        data = latest;
      }
      if (data?.author) {
        data.author.id = authorId;
      }
      if (data) {
        data.author_id = authorId;
      }
      return data;
    },
    onMutate: async (newStory) => {
      await queryClient.cancelQueries({ queryKey: ['stories'] });

      const authorId =
        storiesProfileId ?? (await resolveSessionProfileId(profileId ?? profile?.id));
      const previousStories = authorId
        ? queryClient.getQueryData<StoryGroup[]>(['stories', authorId])
        : undefined;

      if (authorId) {
        const optimisticStory: Story = {
          id: `optimistic-${Date.now()}`,
          author_id: authorId,
          media_url: newStory.mediaUrl,
          media_type: newStory.mediaType,
          thumbnail_url: newStory.thumbnailUrl || null,
          caption: newStory.caption || null,
          is_close_friends_only: newStory.isCloseFriendsOnly || false,
          view_count: 0,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          aspect_ratio: newStory.aspectRatio,
          duration: newStory.duration,
          author: {
            id: authorId,
            username: profile?.username || 'You',
            avatar_url: profile?.avatar_url || null,
            display_name: profile?.display_name || null,
          },
          has_viewed: true,
          isOptimistic: true,
          isUploading: true,
        };

        queryClient.setQueryData<StoryGroup[]>(['stories', authorId], (old) => {
          if (!old) {
            return [{
              user: optimisticStory.author!,
              stories: [optimisticStory],
              hasUnviewed: false,
            }];
          }

          const existingOwnGroup = old.find(g => g.user.id === authorId);
          if (existingOwnGroup) {
            return old.map(g => 
              g.user.id === authorId 
                ? { ...g, stories: [optimisticStory, ...g.stories.filter(s => !s.isOptimistic)] }
                : g
            );
          } else {
            return [{
              user: optimisticStory.author!,
              stories: [optimisticStory],
              hasUnviewed: false,
            }, ...old];
          }
        });
      }

      return { previousStories, authorId };
    },
    onSuccess: (data) => {
      const authorId = data.author_id;
      if (!authorId) return;
      queryClient.setQueryData<StoryGroup[]>(['stories', authorId], (old) => {
        const story = {
          ...data,
          has_viewed: true,
          isOptimistic: false,
          isUploading: false,
        } as Story;

        if (!old || old.length === 0) {
          return [{
            user: (story.author as StoryGroup['user']) ?? {
              id: authorId,
              username: profile?.username || 'You',
              avatar_url: profile?.avatar_url || null,
              display_name: profile?.display_name || null,
            },
            stories: [story],
            hasUnviewed: false,
          }];
        }

        const hasOwnGroup = old.some((g) => g.user.id === authorId);
        if (!hasOwnGroup) {
          return [{
            user: (story.author as StoryGroup['user']) ?? {
              id: authorId,
              username: profile?.username || 'You',
              avatar_url: profile?.avatar_url || null,
              display_name: profile?.display_name || null,
            },
            stories: [story],
            hasUnviewed: false,
          }, ...old];
        }

        return old.map((group) => {
          if (group.user.id !== authorId) return group;
          const withoutOptimistic = group.stories.filter((s) => !s.isOptimistic && !s.isUploading);
          return {
            ...group,
            stories: [story, ...withoutOptimistic.filter((s) => s.id !== story.id)],
          };
        });
      });
    },
    onError: (err, newStory, context) => {
      const cacheKey = context?.authorId ?? storiesProfileId;
      if (context?.previousStories && cacheKey) {
        queryClient.setQueryData(['stories', cacheKey], context.previousStories);
      } else if (cacheKey) {
        queryClient.setQueryData<StoryGroup[]>(['stories', cacheKey], (old) => {
          if (!old) return old;
          return old
            .map((group) =>
              group.user.id === cacheKey
                ? {
                    ...group,
                    stories: group.stories.filter((s) => !s.isOptimistic && !s.isUploading),
                  }
                : group,
            )
            .filter((group) => group.stories.length > 0);
        });
      }
      console.warn('[Stories] create failed:', err);
    },
    onSettled: (_data, error, _vars, context) => {
      const cacheKey = context?.authorId ?? storiesProfileId;
      if (!cacheKey) return;
      if (error) {
        queryClient.setQueryData<StoryGroup[]>(['stories', cacheKey], (old) => {
          if (!old) return old;
          return old
            .map((group) =>
              group.user.id === cacheKey
                ? {
                    ...group,
                    stories: group.stories.filter((s) => !s.isOptimistic && !s.isUploading),
                  }
                : group,
            )
            .filter((group) => group.stories.length > 0);
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['stories', cacheKey], refetchType: 'active' });
    },
  });
}

export function useViewStory() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('story_views')
        .upsert(
          {
            story_id: storyId,
            viewer_id: profile.id,
          },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        );

      if (error) throw error;
    },
    onMutate: async (storyId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['stories', profile?.id] });

      // Snapshot previous value
      const previousStories = queryClient.getQueryData<StoryGroup[]>(['stories', profile?.id]);

      // Optimistically update to mark story as viewed
      queryClient.setQueryData<StoryGroup[]>(['stories', profile?.id], (old) => {
        if (!old) return old;

        return old.map(group => {
          const updatedStories = group.stories.map(story => 
            story.id === storyId ? { ...story, has_viewed: true } : story
          );
          
          // Recalculate hasUnviewed for the group
          const hasUnviewed = updatedStories.some(s => !s.has_viewed);
          
          return {
            ...group,
            stories: updatedStories,
            hasUnviewed,
          };
        });
      });

      return { previousStories };
    },
    onError: (err, storyId, context) => {
      // Rollback on error
      if (context?.previousStories) {
        queryClient.setQueryData(['stories', profile?.id], context.previousStories);
      }
    },
    onSettled: () => {
      // Don't refetch immediately - allow UI to show viewed state
      // Refetch on next interval
    },
  });
}

export function useCloseFriends() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['close-friends', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await db
        .from('close_friends')
        .select(`
          id,
          friend:profiles!friend_id(id, username, avatar_url, display_name)
        `)
        .eq('user_id', profile.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });
}

export function useManageCloseFriend() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ friendId, action }: { friendId: string; action: 'add' | 'remove' }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      if (action === 'add') {
        const { error } = await db
          .from('close_friends')
          .insert({
            user_id: profile.id,
            friend_id: friendId,
          });
        if (error) throw error;
      } else {
        const { error } = await db
          .from('close_friends')
          .delete()
          .eq('user_id', profile.id)
          .eq('friend_id', friendId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-friends'] });
    },
  });
}
