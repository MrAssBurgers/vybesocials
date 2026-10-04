import { useCommunityQuery } from './useCommunityQuery';
import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { getDocumentFromServer } from '@/lib/firebase/firestoreDb';
import { removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { communityAccessChanged, communityJoinBody, type CommunityJoinInput } from '@/lib/communityService';

export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
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
  invite_expires_at?: string;
  requiresRecovery?: boolean;
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
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;

  return useCommunityQuery({
    queryKey: ['my-communities', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { servers } = await communityRequest<{ servers: (Community & { myRole: CommunityRole })[] }>('community-manage', { action: 'listMine' });
      return servers;
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch a single community
export function useCommunity(communityId: string | undefined) {
  const accountId = useAuth().user?.id;
  return useCommunityQuery({
    queryKey: ['community', communityId, accountId],
    queryFn: async () => {
      if (!communityId) return null;

      return getDocumentFromServer<Community>('servers', communityId);
    },
    enabled: !!communityId && !!accountId,
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch rooms for a community
export function useRooms(communityId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const accountId = useAuth().user?.id;
  return useCommunityQuery({
    queryKey: ['rooms', communityId, accountId],
    queryFn: async () => {
      if (!communityId) return [];

      const { channels } = await communityRequest<{ channels: (Room & { server_id: string })[] }>('community-manage', { action: 'listChannels', serverId: communityId });
      return channels.map(channel => ({ ...channel, community_id: channel.server_id }));
    },
    enabled: !!communityId && !!accountId,
    staleTime: 1000 * 60 * 5,
  });
}

// Fetch community members with profiles
export function useCommunityMembers(communityId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const accountId = useAuth().user?.id;
  return useCommunityQuery({
    queryKey: ['community-members', communityId, accountId],
    queryFn: async () => {
      if (!communityId) return [];

      const { members } = await communityRequest<{ members: (CommunityMember & { server_id: string })[] }>('community-manage', { action: 'listMembers', serverId: communityId });
      return members.map(member => ({ ...member, community_id: member.server_id }));
    },
    enabled: !!communityId && !!accountId,
    staleTime: 1000 * 60 * 2,
  });
}

// Fetch live activity for a community
export function useLiveActivity(communityId: string | undefined) {
  const accountId = useAuth().user?.id;
  const queryClient = useQueryClient();

  const query = useCommunityQuery({
    queryKey: ['live-activity', communityId, accountId],
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
    enabled: !!communityId && !!accountId,
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
  const communityRequest = useCommunityRequest();
  const creationRequest = useRef<{ key: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic?: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const key = JSON.stringify([profile.id, name.trim(), description?.trim() || '', isPublic !== false]);
      if (creationRequest.current?.key !== key) creationRequest.current = { key, id: crypto.randomUUID() };
      const { server } = await communityRequest<{ server: Community }>('community-create', { name, description, isPublic, requestId: creationRequest.current.id });
      return server;
    },
    onSuccess: () => {
      creationRequest.current = null;
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      toast.success('Community created!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create community');
    },
  });
}

// Join a community by invite code
export function useJoinCommunity() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async (target: CommunityJoinInput) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { server } = await communityRequest<{ server: Community }>('community-join', communityJoinBody(target));
      return server;
    },
    onSuccess: (community) => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      toast.success(`Joined ${community.name}!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to join community');
    },
  });
}

// Leave a community
export function useLeaveCommunity() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async (communityId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      await communityRequest('community-manage', { action: 'leave', serverId: communityId });
    },
    onSuccess: () => {
      communityAccessChanged();
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
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

  return useCommunityMutation({
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
  const communityRequest = useCommunityRequest();
  return useQuery({
    queryKey: ['public-communities', search],
    queryFn: async () => {
      const { servers } = await communityRequest<{ servers: Community[] }>('community-manage', { action: 'discover', search });
      return servers;
    },
    staleTime: 1000 * 60 * 2,
    networkMode: 'always',
    placeholderData: (prev) => prev,
  });
}

// Get my role in a community
export function useMyCommunityRole(communityId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;

  return useCommunityQuery({
    queryKey: ['my-community-role', communityId, profileId],
    queryFn: async () => {
      if (!communityId || !profileId) return null;

      const { servers } = await communityRequest<{ servers: (Community & { myRole: CommunityRole })[] }>('community-manage', { action: 'listMine' });
      return servers.find(server => server.id === communityId)?.myRole ?? null;
    },
    enabled: !!communityId && !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}
