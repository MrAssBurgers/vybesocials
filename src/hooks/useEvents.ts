import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { startOfDay, endOfDay, endOfWeek, startOfWeek, endOfMonth, nextFriday, nextSunday, isAfter } from 'date-fns';

export interface VybeEvent {
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
  created_at: string;
  updated_at: string;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
  rsvp_count?: number;
  user_rsvp?: 'going' | 'interested' | 'not_going' | null;
}

export interface EventRSVP {
  id: string;
  event_id: string;
  user_id: string;
  status: 'going' | 'interested' | 'not_going';
  created_at: string;
  user?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface EventsFilters {
  type?: 'in-person' | 'online';
  upcoming?: boolean;
  hostId?: string;
  category?: string;
  location?: string;
  dateRange?: 'today' | 'this-week' | 'this-weekend' | 'this-month' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export const EVENT_CATEGORIES = [
  { value: 'music', label: 'Music', emoji: '🎵' },
  { value: 'sports', label: 'Sports', emoji: '⚽' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮' },
  { value: 'meetup', label: 'Meetup', emoji: '🤝' },
  { value: 'party', label: 'Party', emoji: '🎉' },
  { value: 'food', label: 'Food & Drink', emoji: '🍕' },
  { value: 'art', label: 'Art & Design', emoji: '🎨' },
  { value: 'tech', label: 'Tech', emoji: '💻' },
  { value: 'fitness', label: 'Fitness', emoji: '💪' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'howudoin', label: 'How U Doin', emoji: '💬' },
  { value: 'other', label: 'Other', emoji: '✨' },
] as const;

export function useEvents(filters?: EventsFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['events', filters],
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

      if (filters?.type) {
        query = query.eq('event_type', filters.type);
      }
      if (filters?.upcoming) {
        query = query.gte('start_time', new Date().toISOString());
      }
      if (filters?.hostId) {
        query = query.eq('host_id', filters.hostId);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      // Date range filtering
      if (filters?.dateRange) {
        const now = new Date();
        switch (filters.dateRange) {
          case 'today':
            query = query.gte('start_time', startOfDay(now).toISOString())
              .lte('start_time', endOfDay(now).toISOString());
            break;
          case 'this-week':
            query = query.gte('start_time', now.toISOString())
              .lte('start_time', endOfWeek(now).toISOString());
            break;
          case 'this-weekend': {
            const fri = nextFriday(startOfDay(now));
            const sun = nextSunday(startOfDay(now));
            query = query.gte('start_time', (isAfter(now, fri) ? now : fri).toISOString())
              .lte('start_time', endOfDay(sun).toISOString());
            break;
          }
          case 'this-month':
            query = query.gte('start_time', now.toISOString())
              .lte('start_time', endOfMonth(now).toISOString());
            break;
          case 'custom':
            if (filters.dateFrom) query = query.gte('start_time', filters.dateFrom);
            if (filters.dateTo) query = query.lte('start_time', filters.dateTo);
            break;
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get RSVP counts and user's RSVP status
      const eventsWithRSVP = await Promise.all(
        data.map(async (event) => {
          const { count } = await supabase
            .from('event_rsvps')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('status', 'going');

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
            rsvp_count: count || 0,
            user_rsvp: userRSVP,
          };
        })
      );

      return eventsWithRSVP as VybeEvent[];
    },
  });
}

export function useEvent(id: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data, error } = await supabase
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
        .eq('id', id)
        .single();

      if (error) throw error;

      // Get RSVP count
      const { count } = await supabase
        .from('event_rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'going');

      // Get user's RSVP
      let userRSVP = null;
      if (profile) {
        const { data: rsvp } = await supabase
          .from('event_rsvps')
          .select('status')
          .eq('event_id', id)
          .eq('user_id', profile.id)
          .single();
        userRSVP = rsvp?.status || null;
      }

      return {
        ...data,
        rsvp_count: count || 0,
        user_rsvp: userRSVP,
      } as VybeEvent;
    },
    enabled: !!id,
  });
}

export function useMyEvents() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['my-events', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('host_id', profile.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as VybeEvent[];
    },
    enabled: !!profile,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (event: Omit<VybeEvent, 'id' | 'host_id' | 'created_at' | 'updated_at' | 'host' | 'rsvp_count' | 'user_rsvp'>) => {
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
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VybeEvent> & { id: string }) => {
      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
  });
}

export function useEventRSVP() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: 'going' | 'interested' | 'not_going' | null }) => {
      if (!profile) throw new Error('Not authenticated');

      if (status === null) {
        // Remove RSVP
        const { error } = await supabase
          .from('event_rsvps')
          .delete()
          .eq('event_id', eventId)
          .eq('user_id', profile.id);
        if (error) throw error;
      } else {
        // Upsert RSVP
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
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });
}

export function useEventAttendees(eventId: string) {
  return useQuery({
    queryKey: ['event-attendees', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .select(`
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('event_id', eventId)
        .in('status', ['going', 'interested'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as EventRSVP[];
    },
    enabled: !!eventId,
  });
}
