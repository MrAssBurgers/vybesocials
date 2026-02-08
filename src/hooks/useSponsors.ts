import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface SponsorProfile {
  id: string;
  user_id: string;
  company_name: string;
  company_logo: string | null;
  website_url: string | null;
  description: string | null;
  is_verified: boolean;
  verification_date: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollabPost {
  id: string;
  post_id: string;
  collaborator_id: string;
  role: 'primary' | 'collaborator' | 'sponsor';
  accepted_at: string | null;
  created_at: string;
  collaborator?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

export function useSponsorProfile(userId?: string) {
  const { profile } = useAuth();
  const targetUserId = userId || profile?.id;

  return useQuery({
    queryKey: ['sponsor-profile', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('sponsor_profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as SponsorProfile | null;
    },
    enabled: !!targetUserId,
  });
}

export function useCreateSponsorProfile() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      company_name: string;
      company_logo?: string;
      website_url?: string;
      description?: string;
      contact_email?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');

      const { data: sponsor, error } = await supabase
        .from('sponsor_profiles')
        .insert({
          user_id: profile.id,
          ...data,
        })
        .select()
        .single();

      if (error) throw error;
      return sponsor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsor-profile'] });
    },
  });
}

export function usePostCollaborators(postId: string) {
  return useQuery({
    queryKey: ['post-collaborators', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collab_posts')
        .select(`
          *,
          collaborator:profiles!collaborator_id (
            id,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('post_id', postId);

      if (error) throw error;
      return data as CollabPost[];
    },
    enabled: !!postId,
  });
}

export function useAddCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      collaboratorId,
      role = 'collaborator',
    }: {
      postId: string;
      collaboratorId: string;
      role?: 'collaborator' | 'sponsor';
    }) => {
      const { data, error } = await supabase
        .from('collab_posts')
        .insert({
          post_id: postId,
          collaborator_id: collaboratorId,
          role,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post-collaborators', postId] });
    },
  });
}

export function useAcceptCollab() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collabId: string) => {
      const { data, error } = await supabase
        .from('collab_posts')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', collabId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['post-collaborators', data.post_id] });
    },
  });
}

export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collabId, postId }: { collabId: string; postId: string }) => {
      const { error } = await supabase
        .from('collab_posts')
        .delete()
        .eq('id', collabId);

      if (error) throw error;
      return { postId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['post-collaborators', data.postId] });
    },
  });
}

// Get sponsor analytics
export function useSponsorAnalytics(sponsorId: string) {
  return useQuery({
    queryKey: ['sponsor-analytics', sponsorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sponsor_analytics')
        .select('*')
        .eq('sponsor_id', sponsorId)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Aggregate stats
      const stats = {
        totalViews: 0,
        totalClicks: 0,
        totalRsvps: 0,
        totalJoins: 0,
        totalShares: 0,
        byContent: new Map<string, {
          views: number;
          clicks: number;
          rsvps: number;
          joins: number;
          shares: number;
        }>(),
      };

      (data || []).forEach((event: any) => {
        const key = `${event.content_type}:${event.content_id}`;
        
        if (!stats.byContent.has(key)) {
          stats.byContent.set(key, {
            views: 0,
            clicks: 0,
            rsvps: 0,
            joins: 0,
            shares: 0,
          });
        }
        
        const contentStats = stats.byContent.get(key)!;
        
        switch (event.event_type) {
          case 'view':
            stats.totalViews++;
            contentStats.views++;
            break;
          case 'click':
            stats.totalClicks++;
            contentStats.clicks++;
            break;
          case 'rsvp':
            stats.totalRsvps++;
            contentStats.rsvps++;
            break;
          case 'join':
            stats.totalJoins++;
            contentStats.joins++;
            break;
          case 'share':
            stats.totalShares++;
            contentStats.shares++;
            break;
        }
      });

      return {
        ...stats,
        byContent: Object.fromEntries(stats.byContent),
      };
    },
    enabled: !!sponsorId,
  });
}
