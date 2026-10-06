import { communityReadPhaseCurrent, useCommunityReadPhase } from './useCommunityReadPhase';
import { useCommunityQuery } from './useCommunityQuery';
import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { getDocumentFromServer } from '@/lib/firebase/firestoreDb';
import { loadCommunityMessages, watchCommunityChannel } from '@/lib/communityMessages';
import { communityAccessChanged, communityAccountLease, isCommunitySessionCurrent } from '@/lib/communityService';
import { useCommunitySession } from './useCommunitySession';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { communityJoinBody, type CommunityJoinInput } from '@/lib/communityService';

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
  invite_expires_at?: string;
  requiresRecovery?: boolean;
  cover_url?: string | null;
  active_now_count?: number;
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
  author_id?: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  attachment_id?: string | null;
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
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;

  return useCommunityQuery({
    queryKey: ['my-servers', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { servers } = await communityRequest<{ servers: (Server & { myRole: ServerRole })[] }>('community-manage', { action: 'listMine' });
      return servers;
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}

// Fetch a single server
export function useServer(serverId: string | undefined) {
  const accountId = useAuth().user?.id;
  return useCommunityQuery({
    queryKey: ['server', serverId, accountId],
    queryFn: async () => {
      if (!serverId) return null;

      return getDocumentFromServer<Server>('servers', serverId);
    },
    enabled: !!serverId && !!accountId,
  });
}

// Fetch server members
export function useServerMembers(serverId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const accountId = useAuth().user?.id;
  return useCommunityQuery({
    queryKey: ['server-members', serverId, accountId],
    queryFn: async () => {
      if (!serverId) return [];

      const { members } = await communityRequest<{ members: ServerMember[] }>('community-manage', { action: 'listMembers', serverId });
      return members;
    },
    enabled: !!serverId && !!accountId,
  });
}

// Fetch channels for a server (with realtime updates)
export function useChannels(serverId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const accountId = useAuth().user?.id;

  return useCommunityQuery({
    queryKey: ['channels', serverId, accountId],
    queryFn: async () => {
      if (!serverId) return [];

      const { channels } = await communityRequest<{ channels: Channel[] }>('community-manage', { action: 'listChannels', serverId });
      return channels;
    },
    refetchInterval: 15000,
    enabled: !!serverId && !!accountId,
  });
}

// Fetch messages for a channel
export function useChannelMessages(channelId: string | undefined) {
  const { uid: accountId, session, ready } = useCommunitySession();
  const queryClient = useQueryClient();
  const phase = useCommunityReadPhase();
  const scope = `${session.epoch}:${accountId}:${channelId}:${phase.generation}`;
  const [listenerError, setListenerError] = useState<{ scope: string; error: Error; at: number } | null>(null);

  const query = useCommunityQuery({
    queryKey: ['channel-messages', channelId, accountId],
    queryFn: async () => {
      if (!channelId) return [];

      return loadCommunityMessages(channelId, communityAccountLease(accountId, session));
    },
    enabled: !!channelId && !!accountId,
  });

  useEffect(() => {
    if (!channelId || !ready || !phase.foreground) return;
    let active = true;
    const current = () => active && communityReadPhaseCurrent(phase) && isCommunitySessionCurrent(session);
    const invalidate = () => { if (current()) void queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId, accountId, session.uid, session.epoch, phase.generation], exact: true }); };
    const stop = watchCommunityChannel(channelId, invalidate, error => {
      if (!current()) return;
      setListenerError({ scope, error, at: Date.now() });
      invalidate();
    });
    return () => { active = false; stop(); };
  }, [channelId, queryClient, session, accountId, ready, scope, phase]);

  const denied = listenerError?.scope === scope && query.dataUpdatedAt <= listenerError.at;
  return { ...query, data: denied ? undefined : query.data, error: denied ? listenerError.error : query.error, isError: denied || query.isError };
}

// Create a server
export function useCreateServer() {
  const communityRequest = useCommunityRequest();
  const creationRequest = useRef<{ key: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic?: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const key = JSON.stringify([profile.id, name.trim(), description?.trim() || '', isPublic !== false]);
      if (creationRequest.current?.key !== key) creationRequest.current = { key, id: crypto.randomUUID() };
      const { server } = await communityRequest<{ server: Server }>('community-create', { name, description, isPublic, requestId: creationRequest.current.id });
      return server;
    },
    onSuccess: () => {
      creationRequest.current = null;
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success('Server created!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create server');
    },
  });
}

// Join a server by invite code
export function useJoinServer() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async (target: CommunityJoinInput) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { server } = await communityRequest<{ server: Server }>('community-join', communityJoinBody(target));
      return server;
    },
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success(`Joined ${server.name}!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to join server');
    },
  });
}

// Leave a server
export function useLeaveServer() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async (serverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      await communityRequest('community-manage', { action: 'leave', serverId });
    },
    onSuccess: () => {
      communityAccessChanged();
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast.success('Left server');
    },
    onError: () => {
      toast.error('Failed to leave server');
    },
  });
}

// Create a channel
export function useCreateChannel() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async ({ serverId, name, type, isPrivate }: { serverId: string; name: string; type?: ChannelType; isPrivate?: boolean }) => {
      const { channel } = await communityRequest<{ channel: Channel }>('community-manage', { action: 'createChannel', serverId, name, type, isPrivate });
      return channel;
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
  const sendRequest = useRef<{ key: string; id: string } | null>(null);
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async ({ channelId, content, mediaUrl, mediaType, replyToId }: {
      channelId: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const key = JSON.stringify([profile.id, channelId, content || '', mediaUrl || '', mediaType || '', replyToId || '']);
      if (sendRequest.current?.key !== key) sendRequest.current = { key, id: crypto.randomUUID() };
      const { message } = await communityRequest<{ message: ChannelMessage }>('community-send-message', { channelId, content, mediaUrl, mediaType, replyToId, clientMessageId: sendRequest.current.id });
      return message;
    },
    onSuccess: (_, { channelId }) => {
      sendRequest.current = null;
      queryClient.invalidateQueries({ queryKey: ['channel-messages', channelId] });
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });
}

// Update member role
export function useUpdateServerMemberRole() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async ({ serverId, userId, role }: { serverId: string; userId: string; role: ServerRole }) => {
      await communityRequest('community-manage', { action: 'setRole', serverId, userId, role });
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['community-members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['my-server-role'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-role'] });
      toast.success('Role updated');
    },
    onError: () => {
      toast.error('Failed to update role');
    },
  });
}

// Kick/ban member
export function useRemoveServerMember() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async ({ serverId, userId }: { serverId: string; userId: string }) => {
      await communityRequest('community-manage', { action: 'removeMember', serverId, userId });
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['community-members', serverId] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['my-server-role'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-role'] });
      toast.success('Member removed');
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });
}

// Get my role in a server
export function useMyServerRole(serverId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;

  return useCommunityQuery({
    queryKey: ['my-server-role', serverId, profileId],
    queryFn: async () => {
      if (!serverId || !profileId) return null;

      const { servers } = await communityRequest<{ servers: (Server & { myRole: ServerRole })[] }>('community-manage', { action: 'listMine' });
      return servers.find(server => server.id === serverId)?.myRole ?? null;
    },
    enabled: !!serverId && !!profileId,
  });
}

// Fetch all public servers
export function usePublicServers(search?: string) {
  const communityRequest = useCommunityRequest();
  return useQuery({
    queryKey: ['public-servers', search],
    queryFn: async () => {
      const { servers } = await communityRequest<{ servers: Server[] }>('community-manage', { action: 'discover', search });
      return servers;
    },
    staleTime: 30000,
  });
}
