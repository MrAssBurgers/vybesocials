import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useState, useCallback } from 'react';

export interface ParallelFeed {
  id: string;
  user_id: string;
  name: string;
  feed_type: 'following' | 'trending' | 'discover' | 'custom';
  filters: {
    tags?: string[];
    users?: string[];
    media_type?: 'all' | 'images' | 'videos' | 'text';
    time_range?: 'hour' | 'day' | 'week' | 'month' | 'all';
  };
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// Default feeds everyone gets
const DEFAULT_FEEDS: Omit<ParallelFeed, 'id' | 'user_id' | 'created_at'>[] = [
  { name: 'For You', feed_type: 'following', filters: {}, sort_order: 0, is_active: true },
  { name: 'Trending', feed_type: 'trending', filters: { time_range: 'day' }, sort_order: 1, is_active: true },
  { name: 'Discover', feed_type: 'discover', filters: {}, sort_order: 2, is_active: true },
];

export function useParallelFeeds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['parallel-feeds', user?.id],
    queryFn: async (): Promise<ParallelFeed[]> => {
      if (!user?.id) {
        return DEFAULT_FEEDS.map((f, i) => ({
          ...f,
          id: `default-${i}`,
          user_id: '',
          created_at: new Date().toISOString(),
        }));
      }

      const { data, error } = await supabase
        .from('parallel_feeds' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      
      const typedData = data as unknown as ParallelFeed[];
      // Return defaults if user has no custom feeds
      if (!typedData || typedData.length === 0) {
        return DEFAULT_FEEDS.map((f, i) => ({
          ...f,
          id: `default-${i}`,
          user_id: user.id,
          created_at: new Date().toISOString(),
        }));
      }

      return typedData;
    },
    enabled: true,
    staleTime: 60_000,
  });
}

export function useCreateFeed() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (feed: Omit<ParallelFeed, 'id' | 'user_id' | 'created_at'>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('parallel_feeds' as any)
        .insert({
          user_id: user.id,
          ...feed,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as ParallelFeed;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parallel-feeds', user?.id] });
    },
  });
}

export function useUpdateFeed() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ParallelFeed> & { id: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('parallel_feeds' as any)
        .update(updates as any)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as ParallelFeed;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parallel-feeds', user?.id] });
    },
  });
}

export function useDeleteFeed() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (feedId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('parallel_feeds' as any)
        .delete()
        .eq('id', feedId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parallel-feeds', user?.id] });
    },
  });
}

/**
 * Hook to manage active feed selection with swipe gestures
 */
export function useActiveFeed() {
  const { data: feeds = [] } = useParallelFeeds();
  const [activeIndex, setActiveIndex] = useState(0);

  const activeFeed = feeds[activeIndex] || feeds[0];

  const nextFeed = useCallback(() => {
    setActiveIndex((i) => (i + 1) % feeds.length);
  }, [feeds.length]);

  const prevFeed = useCallback(() => {
    setActiveIndex((i) => (i - 1 + feeds.length) % feeds.length);
  }, [feeds.length]);

  const setFeed = useCallback((index: number) => {
    if (index >= 0 && index < feeds.length) {
      setActiveIndex(index);
    }
  }, [feeds.length]);

  return {
    feeds,
    activeFeed,
    activeIndex,
    nextFeed,
    prevFeed,
    setFeed,
  };
}
