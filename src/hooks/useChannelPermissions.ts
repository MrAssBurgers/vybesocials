import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMyServerRole } from '@/hooks/useServers';

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
  return useQuery({
    queryKey: ['channel-permissions', channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const { data, error } = await supabase
        .from('channel_permissions')
        .select('*')
        .eq('channel_id', channelId)
        .order('role');
      if (error) throw error;
      return (data || []) as ChannelPermission[];
    },
    enabled: !!channelId,
  });
}

/** Get the current user's effective permissions for a channel */
export function useMyChannelPermissions(channelId: string | undefined, serverId: string | undefined) {
  const { data: myRole } = useMyServerRole(serverId);

  return useQuery({
    queryKey: ['my-channel-permissions', channelId, myRole],
    queryFn: async () => {
      if (!channelId || !myRole) return null;
      // Owner always has full permissions
      if (myRole === 'owner') {
        return { can_view: true, can_send: true, can_manage: true, can_pin: true, can_attach_media: true };
      }
      const { data, error } = await supabase
        .from('channel_permissions')
        .select('can_view, can_send, can_manage, can_pin, can_attach_media')
        .eq('channel_id', channelId)
        .eq('role', myRole)
        .single();
      if (error) return { can_view: true, can_send: true, can_manage: false, can_pin: false, can_attach_media: true };
      return data as Pick<ChannelPermission, 'can_view' | 'can_send' | 'can_manage' | 'can_pin' | 'can_attach_media'>;
    },
    enabled: !!channelId && !!myRole,
  });
}

export function useUpdateChannelPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, role, field, value }: {
      channelId: string;
      role: string;
      field: 'can_view' | 'can_send' | 'can_manage' | 'can_pin' | 'can_attach_media';
      value: boolean;
    }) => {
      const { error } = await supabase
        .from('channel_permissions')
        .update({ [field]: value, updated_at: new Date().toISOString() } as never)
        .eq('channel_id', channelId)
        .eq('role', role);
      if (error) throw error;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-permissions', channelId] });
      queryClient.invalidateQueries({ queryKey: ['my-channel-permissions', channelId] });
    },
  });
}
