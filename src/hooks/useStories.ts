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
  author?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  has_viewed?: boolean;
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

      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          author:profiles!author_id(id, username, avatar_url, display_name)
        `)
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

      // Sort: own stories first, then unviewed, then viewed
      const groups = Array.from(groupedMap.values());
      groups.sort((a, b) => {
        if (a.user.id === profile.id) return -1;
        if (b.user.id === profile.id) return 1;
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return 0;
      });

      return groups;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000, // Refetch every 30s to update expiry
  });
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
    }: {
      mediaUrl: string;
      mediaType: string;
      caption?: string;
      isCloseFriendsOnly?: boolean;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('stories')
        .insert({
          author_id: profile.id,
          media_url: mediaUrl,
          media_type: mediaType,
          caption,
          is_close_friends_only: isCloseFriendsOnly || false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
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
