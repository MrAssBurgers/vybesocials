import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface Space {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  max_speakers: number;
  allow_requests: boolean;
  listener_count: number;
  peak_listeners: number;
  tags: string[];
  daily_room_name: string | null;
  daily_room_url: string | null;
  created_at: string;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  participants?: SpaceParticipant[];
}

export interface SpaceParticipant {
  id: string;
  space_id: string;
  user_id: string;
  role: 'host' | 'co_host' | 'speaker' | 'listener' | 'requested';
  is_muted: boolean;
  raised_hand: boolean;
  joined_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useSpaces(status?: 'live' | 'scheduled') {
  return useQuery({
    queryKey: ['spaces', status],
    queryFn: async () => {
      let query = db
        .from('spaces' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      } else {
        query = query.in('status', ['live', 'scheduled']);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      
      // Fetch host profiles separately (host_id is the auth user id)
      const hostIds = [...new Set((data || []).map((s: any) => s.host_id))];
      const { data: profiles } = await db
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .in('user_id', hostIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      
      return (data || []).map((s: any) => ({
        ...s,
        host: profileMap.get(s.host_id) || null,
      })) as Space[];
    },
    staleTime: 10_000,
  });
}

export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      if (!spaceId) return null;

      const { data, error } = await db
        .from('spaces' as any)
        .select('*')
        .eq('id', spaceId)
        .single();

      if (error) throw error;
      
      // Fetch host profile (host_id is the auth user id)
      const { data: host } = await db
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .eq('user_id', (data as any).host_id)
        .maybeSingle();

      return { ...(data as any), host } as Space;
    },
    enabled: !!spaceId,
    // Poll so listeners notice when the host ends the space
    refetchInterval: 10_000,
  });
}

export function useSpaceParticipants(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['space-participants', spaceId],
    queryFn: async () => {
      if (!spaceId) return [];

      const { data, error } = await db
        .from('space_participants' as any)
        .select('*')
        .eq('space_id', spaceId)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      
      // Fetch participant profiles (user_id is the auth user id)
      const userIds = [...new Set((data || []).map((p: any) => p.user_id))];
      const { data: profiles } = await db
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      
      return (data || []).map((p: any) => ({
        ...p,
        profile: profileMap.get(p.user_id) || null,
      })) as SpaceParticipant[];
    },
    enabled: !!spaceId,
    refetchInterval: 5000,
  });
}

export function useCreateSpace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { title: string; description?: string; tags?: string[]; scheduledAt?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await db
        .from('spaces' as any)
        .insert({
          host_id: user.id,
          title: input.title,
          description: input.description,
          tags: input.tags || [],
          status: input.scheduledAt ? 'scheduled' : 'live',
          scheduled_at: input.scheduledAt,
          started_at: input.scheduledAt ? null : new Date().toISOString(),
        } as any)
        .select('*')
        .single();

      if (error) throw error;

      // Auto-join as host — muted until they actually unmute (mic starts off)
      await db.from('space_participants' as any).insert({
        space_id: (data as any).id,
        user_id: user.id,
        role: 'host',
        is_muted: true,
      } as any);

      return data as unknown as Space;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

export function useJoinSpace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ spaceId, role = 'listener' }: { spaceId: string; role?: 'listener' | 'requested' }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await db
        .from('space_participants' as any)
        .upsert({
          space_id: spaceId,
          user_id: user.id,
          role,
          is_muted: true,
          left_at: null,
        } as any, { onConflict: 'space_id,user_id' })
        .select()
        .single();

      if (error) throw error;

      // Increment listener count
      await db.rpc('increment_space_listeners' as any, { p_space_id: spaceId });

      return data;
    },
    onSuccess: (_, { spaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId] });
      queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
    },
  });
}

export function useLeaveSpace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (spaceId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      await db
        .from('space_participants' as any)
        .update({ left_at: new Date().toISOString() } as any)
        .eq('space_id', spaceId)
        .eq('user_id', user.id);

      // Decrement listener count
      await db.rpc('decrement_space_listeners' as any, { p_space_id: spaceId });
    },
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId] });
      queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
    },
  });
}

/** Persist the speaker's mute state so other participants see it. */
export function useSetSpaceMute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ spaceId, isMuted }: { spaceId: string; isMuted: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await db
        .from('space_participants' as any)
        .update({ is_muted: isMuted } as any)
        .eq('space_id', spaceId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_, { spaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId] });
    },
  });
}

/** Raise/lower hand — flips role between listener and requested so the host sees it. */
export function useRaiseHand() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ spaceId, raised }: { spaceId: string; raised: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await db
        .from('space_participants' as any)
        .update({ raised_hand: raised, role: raised ? 'requested' : 'listener' } as any)
        .eq('space_id', spaceId)
        .eq('user_id', user.id)
        .in('role', ['listener', 'requested']);
      if (error) throw error;
    },
    onSuccess: (_, { spaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId] });
    },
  });
}

export function useUpdateParticipantRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ participantId, spaceId, role }: { participantId: string; spaceId: string; role: string }) => {
      const { error } = await db
        .from('space_participants' as any)
        .update({ role, raised_hand: false } as any)
        .eq('id', participantId);

      if (error) throw error;
    },
    onSuccess: (_, { spaceId }) => {
      queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId] });
    },
  });
}

export function useEndSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await db
        .from('spaces' as any)
        .update({ status: 'ended', ended_at: new Date().toISOString() } as any)
        .eq('id', spaceId);

      if (error) throw error;
    },
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
    },
  });
}
