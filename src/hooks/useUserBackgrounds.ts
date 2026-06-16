import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface UserBackground {
  id: string;
  user_id: string;
  image_url: string;
  name: string | null;
  storage_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fetch user's background library - with instant load priority
export function useUserBackgrounds() {
  const { profile } = useAuth();
  const profileId = profile?.id;

  return useQuery({
    queryKey: ['user-backgrounds', profileId],
    queryFn: async (): Promise<UserBackground[]> => {
      if (!profileId) return [];

      const { data, error } = await db
        .from('user_backgrounds')
        .select('*')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch user backgrounds:', error);
        throw error;
      }

      return (data || []) as UserBackground[];
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 5, // 5 minutes - cache longer for instant loads
    gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
    refetchOnMount: true, // Always check for updates but show cached first
    refetchOnWindowFocus: false, // Don't refetch on focus to avoid flicker
  });
}

// Get the active background
export function useActiveBackground() {
  const { data: backgrounds } = useUserBackgrounds();
  return backgrounds?.find(bg => bg.is_active) || null;
}

// Prefetch backgrounds on app load for instant access in settings
export function usePrefetchBackgrounds() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const profileId = profile?.id;

  useEffect(() => {
    if (!profileId) return;
    
    // Prefetch backgrounds if not already cached
    queryClient.prefetchQuery({
      queryKey: ['user-backgrounds', profileId],
      queryFn: async (): Promise<UserBackground[]> => {
        const { data, error } = await db
          .from('user_backgrounds')
          .select('*')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as UserBackground[];
      },
      staleTime: 1000 * 60 * 5,
    });
  }, [profileId, queryClient]);
}

// Add a new background to library
export function useAddBackground() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      imageUrl, 
      name, 
      storagePath,
      setActive = true 
    }: { 
      imageUrl: string; 
      name?: string; 
      storagePath?: string;
      setActive?: boolean;
    }) => {
      const profileId = profile?.id;
      if (!profileId) throw new Error('Not authenticated');

      // If setting as active, deactivate others first
      if (setActive) {
        await db
          .from('user_backgrounds')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', profileId);
      }

      // Insert new background
      const { data, error } = await db
        .from('user_backgrounds')
        .insert({
          user_id: profileId,
          image_url: imageUrl,
          name: name || `Background ${Date.now()}`,
          storage_path: storagePath,
          is_active: setActive,
        })
        .select()
        .single();

      if (error) throw error;
      return data as UserBackground;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-backgrounds'] });
    },
    onError: (error: any) => {
      console.error('Failed to add background:', error);
      toast.error('Failed to save background');
    },
  });
}

// Set a background as active
export function useSetActiveBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (backgroundId: string) => {
      const { error } = await db.rpc('set_active_background', {
        p_background_id: backgroundId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-backgrounds'] });
      toast.success('Background applied!');
    },
    onError: (error: any) => {
      console.error('Failed to set active background:', error);
      toast.error('Failed to apply background');
    },
  });
}

// Update background name
export function useRenameBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await db
        .from('user_backgrounds')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-backgrounds'] });
      toast.success('Background renamed!');
    },
    onError: (error: any) => {
      console.error('Failed to rename background:', error);
      toast.error('Failed to rename');
    },
  });
}

// Delete a background
export function useDeleteBackground() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath?: string | null }) => {
      // Delete from storage if path exists
      if (storagePath) {
        await db.storage.from('media').remove([storagePath]);
      }

      // Delete from database
      const { error } = await db
        .from('user_backgrounds')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-backgrounds'] });
      toast.success('Background deleted!');
    },
    onError: (error: any) => {
      console.error('Failed to delete background:', error);
      toast.error('Failed to delete');
    },
  });
}

// Clear active background (remove from view but keep in library)
export function useClearActiveBackground() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const profileId = profile?.id;
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('user_backgrounds')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', profileId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-backgrounds'] });
    },
  });
}
