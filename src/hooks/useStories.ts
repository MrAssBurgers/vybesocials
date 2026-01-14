import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface Story {
  id: string;
  author_id: string;
  media_url: string;
  media_type: string;
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
  };
  stories: Story[];
  hasUnviewed: boolean;
}

export function useStories() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['stories', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Get friends using friend_requests table (accepted requests)
      const { data: asSender } = await supabase
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', profile.id)
        .eq('status', 'accepted');

      const { data: asReceiver } = await supabase
        .from('friend_requests')
        .select('sender_id')
        .eq('receiver_id', profile.id)
        .eq('status', 'accepted');

      // Combine friend IDs
      const friendIds = new Set<string>([
        ...(asSender?.map(r => r.receiver_id) || []),
        ...(asReceiver?.map(r => r.sender_id) || []),
      ]);

      // Get non-expired stories - ONLY from friends and self
      const allowedIds = [profile.id, ...Array.from(friendIds)];
      
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          author:profiles!author_id(id, username, avatar_url, display_name)
        `)
        .in('author_id', allowedIds)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get viewed stories
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', profile.id);

      const viewedIds = new Set(views?.map((v) => v.story_id) || []);

      // Group stories by author
      const storiesWithViews = (data || []).map((story) => ({
        ...story,
        has_viewed: viewedIds.has(story.id),
      }));

      const groupedMap = new Map<string, StoryGroup>();

      for (const story of storiesWithViews) {
        const authorId = story.author_id;
        if (!groupedMap.has(authorId)) {
          groupedMap.set(authorId, {
            user: story.author as StoryGroup['user'],
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
      groups.sort((a, b) => {
        // Own stories first
        if (a.user.id === profile.id) return -1;
        if (b.user.id === profile.id) return 1;
        
        // Within friends, unviewed before viewed
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        
        return 0;
      });

      return groups;
    },
    enabled: !!profile?.id,
    staleTime: 60000, // 1 minute cache
    refetchInterval: 60000, // Refetch every 60s instead of 30s
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

interface CreateStoryParams {
  mediaUrl: string;
  mediaType: string;
  caption?: string;
  isCloseFriendsOnly?: boolean;
  aspectRatio?: number;
  duration?: number | null;
}

export function useCreateStory() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mediaUrl,
      mediaType,
      caption,
      isCloseFriendsOnly,
      aspectRatio,
      duration,
    }: CreateStoryParams) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('stories')
        .insert({
          author_id: profile.id,
          media_url: mediaUrl,
          media_type: mediaType,
          caption,
          is_close_friends_only: isCloseFriendsOnly || false,
          aspect_ratio: aspectRatio || 0.5625,
          duration: duration,
        })
        .select(`
          *,
          author:profiles!author_id(id, username, avatar_url, display_name)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newStory) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['stories'] });

      // Snapshot the previous value
      const previousStories = queryClient.getQueryData<StoryGroup[]>(['stories', profile?.id]);

      // Optimistically update to the new value
      if (profile) {
        const optimisticStory: Story = {
          id: `optimistic-${Date.now()}`,
          author_id: profile.id,
          media_url: newStory.mediaUrl,
          media_type: newStory.mediaType,
          caption: newStory.caption || null,
          is_close_friends_only: newStory.isCloseFriendsOnly || false,
          view_count: 0,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          aspect_ratio: newStory.aspectRatio,
          duration: newStory.duration,
          author: {
            id: profile.id,
            username: profile.username,
            avatar_url: profile.avatar_url,
            display_name: null,
          },
          has_viewed: true,
          isOptimistic: true,
          isUploading: true,
        };

        queryClient.setQueryData<StoryGroup[]>(['stories', profile.id], (old) => {
          if (!old) {
            return [{
              user: optimisticStory.author!,
              stories: [optimisticStory],
              hasUnviewed: false,
            }];
          }

          const existingOwnGroup = old.find(g => g.user.id === profile.id);
          if (existingOwnGroup) {
            return old.map(g => 
              g.user.id === profile.id 
                ? { ...g, stories: [optimisticStory, ...g.stories] }
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

      return { previousStories };
    },
    onError: (err, newStory, context) => {
      // Rollback on error
      if (context?.previousStories) {
        queryClient.setQueryData(['stories', profile?.id], context.previousStories);
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}

export function useViewStory() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('story_views')
        .upsert({
          story_id: storyId,
          viewer_id: profile.id,
        });

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

      const { data, error } = await supabase
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
        const { error } = await supabase
          .from('close_friends')
          .insert({
            user_id: profile.id,
            friend_id: friendId,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
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
