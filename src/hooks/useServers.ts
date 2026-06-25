import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';

export type ServerRole = 'owner' | 'admin' | 'moderator' | 'member';
export type ChannelType = 'text' | 'voice' | 'announcement';

export interface Server {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  invite_code: string;
  is_public: boolean;
  member_count: number;
  created_at: string;
}

export interface ServerMember {
  id: string;
  server_id: string;
  user_id: string;
  role: ServerRole;
  nickname: string | null;
  joined_at: string;
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  position: number;
  is_private: boolean;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  is_edited: boolean;
  reply_to_id: string | null;
  created_at: string;
  sender?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

// Fetch user's servers
export function useMyServers() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-servers', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data: memberships, error: memberError } = await db
        .from('server_members')
        .select('server_id, role')
        .eq('user_id', profileId);

      if (memberError) throw memberError;
      const rows = memberships || [];
      if (!rows.length) return [];

      const serverIds = [...new Set(rows.map((r: { server_id: string }) => r.server_id).filter(Boolean))];
      const { data: servers, error: serverError } = await db
        .from('servers')
        .select('*')
        .in('id', serverIds);

      if (serverError) throw serverError;

      const serverMap = new Map((servers || []).map((s: Server) => [s.id, s]));
      return serverIds
        .map((id) => {
          const server = serverMap.get(id) as Server | undefined;
          const membership = rows.find((r: { server_id: string }) => r.server_id === id);
          if (!server?.id || !server?.name) return null;
          return { ...server, myRole: membership?.role ?? 'member' } as Server & { myRole: ServerRole };
        })
        .filter(Boolean) as (Server & { myRole: ServerRole })[];
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}

// Fetch a single server
export function useServer(serverId: string | undefined) {
  return useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      if (!serverId) return null;

      const { data, error } = await db
        .from('servers')
        .select('*')
        .eq('id', serverId)
        .single();

      if (error) throw error;
      return data as Server;
    },
    enabled: !!serverId,
  });
}

// Fetch server members
export function useServerMembers(serverId: string | undefined) {
  return useQuery({
    queryKey: ['server-members', serverId],
    queryFn: async () => {
      if (!serverId) return [];

      const { data, error } = await db
        .from('server_members')
        .select(`
          *,
          profile:profiles!server_members_user_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('server_id', serverId)
        .order('role', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as ServerMember[];
    },
    enabled: !!serverId,
  });
}

// Fetch channels for a server (with realtime updates)
export function useChannels(serverId: string | undefined) {
  const queryClient = useQueryClient();

  // Subscribe to realtime channel changes
  useEffect(() => {
    if (!serverId) return;

    const channel = subscribePostgresChannel(`channels-realtime-${serverId}`, [
      {
        event: '*',
        table: 'channels',
        filter: `server_id=eq.${serverId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [serverId, queryClient]);

  return useQuery({
    queryKey: ['channels', serverId],
    queryFn: async () => {
      if (!serverId) return [];

      const { data, error } = await db
        .from('channels')
        .select('*')
        .eq('server_id', serverId)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data || []) as Channel[];
    },
    enabled: !!serverId,
  });
}

// Fetch messages for a channel
export function useChannelMessages(channelId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['channel-messages', channelId],
    queryFn: async () => {
      if (!channelId) return [];

      const { data, error } = await db
        .from('channel_messages')
        .select(`
          *,
          sender:profiles!channel_messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('channel_id', channelId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as ChannelMessage[];
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (!channelId) return;

    const channel = subscribePostgresChannel(`channel-messages:${channelId}`, [
      {
        event: '*',
        table: 'channel_messages',
        filter: `channel_id=eq.${channelId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [channelId, queryClient]);

  return query;
}

// Create a server
export function useCreateServer() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic?: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Create server
      const { data: server, error: serverError } = await db
        .from('servers')
        .insert({
          name,
          description: description?.trim() || null,
          owner_id: profile.id,
          is_public: isPublic ?? true,
        })
        .select()
        .single();

      if (serverError) throw serverError;

      // Add owner as member
      await db
        .from('server_members')
        .insert({
          server_id: server.id,
          user_id: profile.id,
          role: 'owner',
        });

      // Create default general channel
      await db
        .from('channels')
        .insert({
          server_id: server.id,
          name: 'general',
          type: 'text',
          position: 0,
        });

      return server as Server;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      toast.success('Server created!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create server');
    },
  });
}

// Join a server by invite code
export function useJoinServer() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Find server by invite code
      const { data: server, error: findError } = await db
        .from('servers')
        .select('id, name')
        .eq('invite_code', inviteCode)
        .single();

      if (findError || !server) throw new Error('Invalid invite code');

      // Check if already a member
      const { data: existing } = await db
        .from('server_members')
        .select('id')
        .eq('server_id', server.id)
        .eq('user_id', profile.id)
        .single();

      if (existing) throw new Error('Already a member of this server');

      // Join server
      const { error: joinError } = await db
        .from('server_members')
        .insert({
          server_id: server.id,
          user_id: profile.id,
          role: 'member',
        });

      if (joinError) throw joinError;

      return server;
    },
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      toast.success(`Joined ${server.name}!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to join server');
    },
  });
}

// Leave a server
export function useLeaveServer() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (serverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('server_members')
        .delete()
        .eq('server_id', serverId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      toast.success('Left server');
    },
    onError: () => {
      toast.error('Failed to leave server');
    },
  });
}

// Create a channel
export function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ serverId, name, type }: { serverId: string; name: string; type?: ChannelType }) => {
      const { data, error } = await db
        .from('channels')
        .insert({
          server_id: serverId,
          name,
          type: type || 'text',
        })
        .select()
        .single();

      if (error) throw error;
      return data as Channel;
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
      queryClient.invalidateQueries({ queryKey: ['rooms', serverId] });
      toast.success('Channel created!');
    },
    onError: () => {
      toast.error('Failed to create channel');
    },
  });
}

// Send a message to a channel
export function useSendChannelMessage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ channelId, content, mediaUrl, mediaType }: {
      channelId: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await db
        .from('channel_messages')
        .insert({
          channel_id: channelId,
          sender_id: profile.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] });
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });
}

// Update member role
export function useUpdateServerMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ serverId, userId, role }: { serverId: string; userId: string; role: ServerRole }) => {
      const { error } = await db
        .from('server_members')
        .update({ role })
        .eq('server_id', serverId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      toast.success('Role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });
}

// Kick/ban member
export function useRemoveServerMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ serverId, userId }: { serverId: string; userId: string }) => {
      const { error } = await db
        .from('server_members')
        .delete()
        .eq('server_id', serverId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      toast.success('Member removed');
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });
}

// Get my role in a server
export function useMyServerRole(serverId: string | undefined) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-server-role', serverId, profileId],
    queryFn: async () => {
      if (!serverId || !profileId) return null;

      const { data, error } = await db
        .from('server_members')
        .select('role')
        .eq('server_id', serverId)
        .eq('user_id', profileId)
        .single();

      if (error) return null;
      return data?.role as ServerRole | null;
    },
    enabled: !!serverId && !!profileId,
  });
}

// Fetch all public servers
export function usePublicServers(search?: string) {
  return useQuery({
    queryKey: ['public-servers', search],
    queryFn: async () => {
      let query = db
        .from('servers')
        .select('*')
        .eq('is_public', true)
        .order('member_count', { ascending: false })
        .limit(50);

      if (search && search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Server[];
    },
    staleTime: 30000,
  });
}
