import { useCommunityRequest } from '@/hooks/useCommunityRequest';
import { useCommunityMutation } from '@/hooks/useCommunityMutation';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { communityAccessChanged } from '@/lib/communityService';

/**
 * Update server settings (name, description, visibility, icon)
 */
export function useUpdateServer() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async ({ 
      serverId, 
      name, 
      description, 
      isPublic,
      iconUrl,
    }: { 
      serverId: string; 
      name?: string; 
      description?: string; 
      isPublic?: boolean;
      iconUrl?: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      await communityRequest('community-manage', { action: 'updateServer', serverId, name, description, isPublic, iconUrl });
      return serverId;
    },
    onSuccess: (serverId) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['community', serverId] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['public-communities'] });
      toast.success('Server updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update server');
    },
  });
}

/**
 * Upload server icon
 */
export function useUploadServerIcon() {
  const { user } = useAuth();

  return useCommunityMutation({
    mutationFn: async ({ serverId, file }: { serverId: string; file: File }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${serverId}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/server-icons/${fileName}`;

      const { error: uploadError } = await db.storage
        .from('media')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage
        .from('media')
        .getPublicUrl(filePath);

      return publicUrl;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload icon');
    },
  });
}

/**
 * Delete a server (owner only)
 */
export function useDeleteServer() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useCommunityMutation({
    mutationFn: async (serverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      await communityRequest('community-manage', { action: 'deleteServer', serverId });
    },
    onSuccess: () => {
      communityAccessChanged();
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['public-communities'] });
      toast.success('Server deleted');
    },
    onError: () => {
      toast.error('Failed to delete server');
    },
  });
}

/**
 * Regenerate invite code
 */
export function useRegenerateInviteCode() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async (serverId: string) => {
      const { inviteCode } = await communityRequest<{ inviteCode: string }>('community-invite', { action: 'regenerate', serverId });
      return inviteCode;
    },
    onSuccess: (newCode, serverId) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['community', serverId] });
      toast.success('New invite code generated');
    },
    onError: () => {
      toast.error('Failed to regenerate invite code');
    },
  });
}

/**
 * Delete a channel
 */
export function useDeleteChannel() {
  const communityRequest = useCommunityRequest();
  const queryClient = useQueryClient();

  return useCommunityMutation({
    mutationFn: async ({ channelId, serverId }: { channelId: string; serverId: string }) => {
      await communityRequest('community-manage', { action: 'deleteChannel', serverId, channelId });
      return serverId;
    },
    onSuccess: (serverId) => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
      queryClient.invalidateQueries({ queryKey: ['rooms', serverId] });
      toast.success('Channel deleted');
    },
    onError: () => {
      toast.error('Failed to delete channel');
    },
  });
}
