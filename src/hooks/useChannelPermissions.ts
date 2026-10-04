import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface ChannelPermission {
  id: string;
  channel_id: string;
  role: string;
  can_view: boolean;
  can_send: boolean;
  can_manage: boolean;
  can_pin: boolean;
  can_attach_media: boolean;
}

export function useChannelPermissions(channelId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;
  return useQuery({
    queryKey: ['channel-permissions', channelId, profileId],
    queryFn: async () => {
      if (!channelId) return [];
      const { permissions } = await communityRequest<{ permissions: ChannelPermission[] }>('community-manage', { action: 'listPermissions', channelId });
      return permissions;
    },
    enabled: !!channelId && !!profileId,
  });
}

/** Get the current user's effective permissions for a channel */
export function useMyChannelPermissions(channelId: string | undefined, serverId: string | undefined) {
  const communityRequest = useCommunityRequest();
  const profileId = useAuth().user?.id;

  return useQuery({
    queryKey: ['my-channel-permissions', channelId, profileId],
    queryFn: async () => {
      if (!channelId || !profileId) return null;
      const { permissions } = await communityRequest<{ permissions: Pick<ChannelPermission, 'can_view' | 'can_send' | 'can_manage' | 'can_pin' | 'can_attach_media'> }>('community-manage', { action: 'permissions', channelId });
      return permissions;
    },
    enabled: !!channelId && !!profileId && !!serverId,
  });
}

export function useUpdateChannelPermission() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async ({ channelId, role, field, value }: {
      channelId: string;
      role: string;
      field: 'can_view' | 'can_send' | 'can_manage' | 'can_pin' | 'can_attach_media';
      value: boolean;
    }) => {
      const { data: channel, error } = await db.from('channels').select('server_id').eq('id', channelId).single();
      if (error || !channel?.server_id) throw new Error('Channel unavailable');
      await communityRequest('community-manage', { action: 'setPermission', serverId: channel.server_id, channelId, role, field, value });
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-permissions', channelId] });
      queryClient.invalidateQueries({ queryKey: ['my-channel-permissions', channelId] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}
