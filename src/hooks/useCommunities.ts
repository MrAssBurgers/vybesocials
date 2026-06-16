import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';

export type CommunityRole = 'owner' | 'moderator' | 'member';
export type RoomType = 'chat' | 'announcements' | 'media' | 'live' | 'qa';

export interface Community {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  cover_url: string | null;
  owner_id: string;
  invite_code: string;
  is_public: boolean;
  member_count: number;
  active_now_count: number;
  created_at: string;
}

export interface Room {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  type: string;
  room_type: RoomType;
  position: number;
  is_private: boolean;
  created_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: CommunityRole;
  nickname: string | null;
  joined_at: string;
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

// Fetch user's communities
export function useMyCommunities() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-communities', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await db
        .from('server_members')
        .select(`
          server_id,
          role,
          servers:server_id (
            id, name, description, icon_url, banner_url, cover_url,
            owner_id, invite_code, is_public, member_count, active_now_count, created_at
          )
        `)
        .eq('user_id', profileId);

      if (error) throw error;
      
      return (data || []).map((d: any) => ({
        ...d.servers,
        myRole: d.role === 'admin' ? 'moderator' : d.role,
      })) as (Community & { myRole: CommunityRole })[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch a single community
export function useCommunity(communityId: string | undefined) {
  return useQuery({
    queryKey: ['community', communityId],
    queryFn: async () => {
      if (!communityId) return null;

      const { data, error } = await db
        .from('servers')
        .select('id, name, description, icon_url, banner_url, cover_url, owner_id, invite_code, is_public, member_count, active_now_count, created_at')
        .eq('id', communityId)
        .single();

      if (error) throw error;
      return data as Community;
    },
    enabled: !!communityId,
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch rooms for a community
export function useRooms(communityId: string | undefined) {
  return useQuery({
    queryKey: ['rooms', communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data, error } = await db
        .from('channels')
        .select('id, server_id, name, description, type, room_type, position, is_private, created_at')
        .eq('server_id', communityId)
        .order('position', { ascending: true });

      if (error) throw error;
      
      return (data || []).map(d => ({
        ...d,
        community_id: d.server_id,
      })) as Room[];
    },
    enabled: !!communityId,
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch community members with profiles
export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['community-members', communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data, error } = await db
        .from('server_members')
        .select(`
          id, server_id, user_id, role, nickname, joined_at,
          profile:profiles!server_members_user_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('server_id', communityId)
        .order('role', { ascending: true });

      if (error) throw error;
      
      return (data || []).map((d: any) => ({
        id: d.id,
        community_id: d.server_id,
        user_id: d.user_id,
        role: d.role === 'admin' ? 'moderator' : d.role,
        nickname: d.nickname,
        joined_at: d.joined_at,
        profile: d.profile,
      })) as CommunityMember[];
    },
    enabled: !!communityId,
    staleTime: 1000 * 60 * 2,
  });
}

// Fetch live activity for a community
export function useLiveActivity(communityId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['live-activity', communityId],
    queryFn: async () => {
      if (!communityId) return [];

      const { data, error } = await db
        .from('live_activity')
        .select(`
          id, community_id, user_id, activity_type, room_id, started_at, last_seen_at
        `)
        .eq('community_id', communityId)
        .gte('last_seen_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

      if (error) throw error;
      return data || [];
    },
    enabled: !!communityId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!communityId) return;

    const channel = subscribePostgresChannel(
      `live-activity-${communityId}`,
      [{
        event: '*',
        table: 'live_activity',
        filter: `community_id=eq.${communityId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['live-activity', communityId] });
        },
      }],
    );

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [communityId, queryClient]);

  return query;
}

// Create a community
export function useCreateCommunity() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic?: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Create community (server)
      const { data: community, error: communityError } = await db
        .from('servers')
        .insert({
          name,
          description,
          owner_id: profile.id,
          is_public: isPublic ?? true,
        })
        .select()
        .single();

      if (communityError) throw communityError;

      // Add owner as member
      await db
        .from('server_members')
        .insert({
          server_id: community.id,
          user_id: profile.id,
          role: 'owner',
        });

      // Create default rooms (all 5)
      await db.rpc('create_default_rooms', { p_server_id: community.id });

      return community as Community;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success('Community created!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create community');
    },
  });
}

// Join a community by invite code
export function useJoinCommunity() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Find community by invite code
      const { data: community, error: findError } = await db
        .from('servers')
        .select('id, name')
        .eq('invite_code', inviteCode)
        .single();

      if (findError || !community) throw new Error('Invalid invite code');

      // Check if already a member
      const { data: existing } = await db
        .from('server_members')
        .select('id')
        .eq('server_id', community.id)
        .eq('user_id', profile.id)
        .single();

      if (existing) throw new Error('Already a member of this community');

      // Join community
      const { error: joinError } = await db
        .from('server_members')
        .insert({
          server_id: community.id,
          user_id: profile.id,
          role: 'member',
        });

      if (joinError) throw joinError;

      return community;
    },
    onSuccess: (community) => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success(`Joined ${community.name}!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to join community');
    },
  });
}

// Leave a community
export function useLeaveCommunity() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (communityId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('server_members')
        .delete()
        .eq('server_id', communityId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success('Left community');
    },
    onError: () => {
      toast.error('Failed to leave community');
    },
  });
}

// Update presence/activity
export function useUpdateActivity() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      communityId, 
      activityType, 
      roomId 
    }: { 
      communityId: string; 
      activityType: 'browsing' | 'chatting' | 'live' | 'listening';
      roomId?: string;
    }) => {
      if (!profile?.id) return;

      await db
        .from('live_activity')
        .upsert({
          community_id: communityId,
          user_id: profile.id,
          activity_type: activityType,
          room_id: roomId,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'community_id,user_id',
        });
    },
  });
}

// Fetch public communities for discovery
export function usePublicCommunities(search?: string) {
  return useQuery({
    queryKey: ['public-communities', search],
    queryFn: async () => {
      let query = db
        .from('servers')
        .select('id, name, description, icon_url, banner_url, cover_url, member_count, active_now_count, invite_code, created_at')
        .eq('is_public', true)
        .order('member_count', { ascending: false })
        .limit(50);

      if (search && search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Community[];
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'always',
    placeholderData: (prev) => prev,
  });
}

// Get my role in a community
export function useMyCommunityRole(communityId: string | undefined) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-community-role', communityId, profileId],
    queryFn: async () => {
      if (!communityId || !profileId) return null;

      const { data, error } = await db
        .from('server_members')
        .select('role')
        .eq('server_id', communityId)
        .eq('user_id', profileId)
        .single();

      if (error) return null;
      const role = data?.role;
      return (role === 'admin' ? 'moderator' : role) as CommunityRole | null;
    },
    enabled: !!communityId && !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}
