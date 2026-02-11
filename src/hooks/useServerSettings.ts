import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

/**
 * Update server settings (name, description, visibility, icon)
 */
export function useUpdateServer() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
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

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isPublic !== undefined) updates.is_public = isPublic;
      if (iconUrl !== undefined) updates.icon_url = iconUrl;

      const { error } = await supabase
        .from('servers')
        .update(updates)
        .eq('id', serverId);

      if (error) throw error;
      return serverId;
    },
    onSuccess: (serverId) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
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
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ serverId, file }: { serverId: string; file: File }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${serverId}-${Date.now()}.${fileExt}`;
      const filePath = `server-icons/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
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
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (serverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('servers')
        .delete()
        .eq('id', serverId)
        .eq('owner_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-servers'] });
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverId: string) => {
      // Generate new invite code
      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const { error } = await supabase
        .from('servers')
        .update({ invite_code: newCode })
        .eq('id', serverId);

      if (error) throw error;
      return newCode;
    },
    onSuccess: (newCode, serverId) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] });
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, serverId }: { channelId: string; serverId: string }) => {
      const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', channelId);

      if (error) throw error;
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
