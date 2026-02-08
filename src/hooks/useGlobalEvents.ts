import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface GlobalEvent {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  online_link: string | null;
  event_type: 'in-person' | 'online';
  cover_image: string | null;
  max_attendees: number | null;
  is_public: boolean;
  visibility: 'global' | 'community' | 'creator' | 'public';
  sponsor_id: string | null;
  live_url: string | null;
  replay_url: string | null;
  is_featured: boolean;
  category: string;
  created_at: string;
  updated_at: string;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
  sponsor?: {
    id: string;
    company_name: string;
    company_logo: string | null;
    is_verified: boolean;
  } | null;
  rsvp_count?: number;
  user_rsvp?: 'going' | 'interested' | 'not_going' | null;
}

interface EventFilters {
  visibility?: 'global' | 'community' | 'creator' | 'public';
  featured?: boolean;
  upcoming?: boolean;
  category?: string;
  hostId?: string;
}

export function useGlobalEvents(filters?: EventFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['global-events', filters],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`
          *,
          host:profiles!host_id (
            id,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('is_public', true)
        .order('start_time', { ascending: true });

      if (filters?.visibility) {
        query = query.eq('visibility', filters.visibility);
      }
      if (filters?.featured) {
        query = query.eq('is_featured', true);
      }
      if (filters?.upcoming) {
        query = query.gte('start_time', new Date().toISOString());
      }
      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.hostId) {
        query = query.eq('host_id', filters.hostId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get sponsor info and RSVP counts
      const eventsWithDetails = await Promise.all(
        (data || []).map(async (event: any) => {
          // Get RSVP count
          const { count } = await supabase
            .from('event_rsvps')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('status', 'going');

          // Get sponsor if exists
          let sponsor = null;
          if (event.sponsor_id) {
            const { data: sponsorData } = await supabase
              .from('sponsor_profiles')
              .select('id, company_name, company_logo, is_verified')
              .eq('id', event.sponsor_id)
              .single();
            sponsor = sponsorData;
          }

          // Get user's RSVP
          let userRSVP = null;
          if (profile) {
            const { data: rsvp } = await supabase
              .from('event_rsvps')
              .select('status')
              .eq('event_id', event.id)
              .eq('user_id', profile.id)
              .single();
            userRSVP = rsvp?.status || null;
          }

          return {
            ...event,
            sponsor,
            rsvp_count: count || 0,
            user_rsvp: userRSVP,
          };
        })
      );

      return eventsWithDetails as GlobalEvent[];
    },
  });
}

export function useFeaturedEvents() {
  return useGlobalEvents({ featured: true, upcoming: true });
}

export function useGlobalBannerEvents() {
  return useQuery({
    queryKey: ['global-banner-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          start_time,
          cover_image,
          visibility,
          is_featured,
          sponsor_id
        `)
        .eq('is_public', true)
        .eq('visibility', 'global')
        .eq('is_featured', true)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(3);

      if (error) throw error;
      return data;
    },
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useEventRSVP() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      eventId, 
      status 
    }: { 
      eventId: string; 
      status: 'going' | 'interested' | 'not_going' | null 
    }) => {
      if (!profile) throw new Error('Not authenticated');

      if (status === null) {
        const { error } = await supabase
          .from('event_rsvps')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('event_rsvps')
          .upsert({
            event_id: eventId,
            user_id: profile.id,
            status,
          }, {
            onConflict: 'event_id,user_id',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-banner-events'] });
    },
  });
}

export function useCreateGlobalEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (event: Omit<GlobalEvent, 'id' | 'host_id' | 'created_at' | 'updated_at' | 'host' | 'sponsor' | 'rsvp_count' | 'user_rsvp'>) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('events')
        .insert({
          ...event,
          host_id: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-events'] });
      queryClient.invalidateQueries({ queryKey: ['global-banner-events'] });
    },
  });
}

// Track sponsor analytics
export function useTrackSponsorEvent() {
  return useMutation({
    mutationFn: async ({
      sponsorId,
      contentType,
      contentId,
      eventType,
    }: {
      sponsorId: string;
      contentType: 'event' | 'post';
      contentId: string;
      eventType: 'view' | 'click' | 'rsvp' | 'join' | 'share';
    }) => {
      const { error } = await supabase
        .from('sponsor_analytics')
        .insert({
          sponsor_id: sponsorId,
          content_type: contentType,
          content_id: contentId,
          event_type: eventType,
        });
      if (error) throw error;
    },
  });
}
