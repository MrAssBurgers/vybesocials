import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface Sticker {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
}

export function useStickers() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['stickers', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from('user_stickers')
        .select('*')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Sticker[];
    },
    enabled: !!profile,
  });
}

export function useAddSticker() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (imageUrl: string) => {
      if (!profile) throw new Error('Not authenticated');
      if (!imageUrl || typeof imageUrl !== 'string') throw new Error('Invalid image URL');
      console.log('[Stickers] Saving sticker, user:', profile.user_id, 'url:', imageUrl.substring(0, 80));
      
      // Check for duplicates
      const { data: existing } = await supabase
        .from('user_stickers')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('image_url', imageUrl)
        .maybeSingle();
      
      if (existing) {
        throw new Error('Already saved');
      }

      const { data, error } = await supabase
        .from('user_stickers')
        .insert({ user_id: profile.user_id, image_url: imageUrl })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stickers'] });
      toast.success('Added to stickers! 🎨');
    },
    onError: (err: Error) => {
      console.error('[Stickers] Save failed:', err.message, err);
      if (err.message === 'Already saved') {
        toast('Already in your stickers');
      } else {
        toast.error('Failed to save sticker');
      }
    },
  });
}

export function useDeleteSticker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stickerId: string) => {
      const { error } = await supabase
        .from('user_stickers')
        .delete()
        .eq('id', stickerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stickers'] });
    },
  });
}
