import { useSocialPostList } from './useSocialPostList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface Filter {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  css_filter: string;
  overlay_url: string | null;
  effect_config: any;
  category: string;
  usage_count: number;
  save_count: number;
  is_published: boolean;
  is_approved: boolean;
  trending_score: number;
  created_at: string;
  creator?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useFilters(category?: string) {
  return useQuery({
    queryKey: ['filters', category],
    queryFn: async () => {
      let query = db
        .from('filters')
        .select('*, creator:profiles!filters_creator_id_fkey(id, username, avatar_url, display_name)')
        .eq('is_published', true)
        .eq('is_approved', true)
        .order('trending_score', { ascending: false })
        .limit(50);

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Filter[];
    },
  });
}

export function useTrendingFilters() {
  return useQuery({
    queryKey: ['filters', 'trending'],
    queryFn: async () => {
      const { data, error } = await db
        .from('filters')
        .select('*, creator:profiles!filters_creator_id_fkey(id, username, avatar_url, display_name)')
        .eq('is_published', true)
        .eq('is_approved', true)
        .order('trending_score', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Filter[];
    },
  });
}

export function useNewFilters() {
  return useQuery({
    queryKey: ['filters', 'new'],
    queryFn: async () => {
      const { data, error } = await db
        .from('filters')
        .select('*, creator:profiles!filters_creator_id_fkey(id, username, avatar_url, display_name)')
        .eq('is_published', true)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Filter[];
    },
  });
}

export function useTopFilterCreators() {
  return useQuery({
    queryKey: ['filters', 'top-creators'],
    queryFn: async () => {
      // Get creators with most filter usage
      const { data, error } = await db
        .from('filters')
        .select('creator_id, creator:profiles!filters_creator_id_fkey(id, username, avatar_url, display_name)')
        .eq('is_published', true)
        .eq('is_approved', true)
        .order('usage_count', { ascending: false })
        .limit(20);
      if (error) throw error;

      // Deduplicate by creator
      const seen = new Set<string>();
      const creators: any[] = [];
      for (const item of data || []) {
        if (!seen.has(item.creator_id)) {
          seen.add(item.creator_id);
          creators.push(item.creator);
        }
      }
      return creators.slice(0, 10);
    },
  });
}

export function useSavedFilters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['filters', 'saved', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from('filter_saves')
        .select('filter_id, filter:filters!filter_saves_filter_id_fkey(*, creator:profiles!filters_creator_id_fkey(id, username, avatar_url, display_name))')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data || []).map(d => d.filter).filter(Boolean) as Filter[];
    },
  });
}

export function useSaveFilter() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async (filterId: string) => {
      const { error } = await db
        .from('filter_saves')
        .insert({ filter_id: filterId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filters', 'saved'] });
    },
  });

  const unsave = useMutation({
    mutationFn: async (filterId: string) => {
      const { error } = await db
        .from('filter_saves')
        .delete()
        .eq('filter_id', filterId)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filters', 'saved'] });
    },
  });

  return { save, unsave };
}

export function useLogFilterUsage() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ filterId, postId }: { filterId: string; postId?: string }) => {
      if (!user) return;
      const { error } = await db
        .from('filter_usage')
        .insert({ filter_id: filterId, user_id: user.id, post_id: postId || null });
      if (error) throw error;
    },
  });
}

export function useMyFilters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['filters', 'mine', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from('filters')
        .select('*')
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Filter[];
    },
  });
}

export function useCreateFilter() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (filter: { name: string; css_filter: string; description?: string; category?: string }) => {
      const { data, error } = await db
        .from('filters')
        .insert({
          creator_id: user!.id,
          name: filter.name,
          css_filter: filter.css_filter,
          description: filter.description || null,
          category: filter.category || 'community',
          is_published: true,
          is_approved: false, // Requires moderation review before public visibility
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filters'] });
    },
  });
}

export function useFilterPosts(filterId: string | null) {
  return useSocialPostList({ scope: 'filter', targetId: filterId ?? undefined }, !!filterId);
}
