import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MemeBanBackground {
  id: string;
  name: string;
  gif_url: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  created_by: string | null;
}

// Fetch all active meme ban backgrounds
export function useMemeBanBackgrounds() {
  return useQuery({
    queryKey: ['meme-ban-backgrounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meme_ban_backgrounds')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as MemeBanBackground[];
    },
  });
}

// Get a random active background
export function useRandomMemeBanBackground() {
  const { data: backgrounds } = useMemeBanBackgrounds();
  
  if (!backgrounds || backgrounds.length === 0) {
    return 'https://media1.tenor.com/m/jUMex_rdqPwAAAAC/among-us-twerk.gif';
  }
  
  const randomIndex = Math.floor(Math.random() * backgrounds.length);
  return backgrounds[randomIndex].gif_url;
}

// Add a new meme ban background
export function useAddMemeBanBackground() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, gifUrl }: { name: string; gifUrl: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('meme_ban_backgrounds')
        .insert({
          name,
          gif_url: gifUrl,
          is_active: true,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meme-ban-backgrounds'] });
      toast.success('Meme ban background added!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add background');
    },
  });
}

// Toggle background active status
export function useToggleMemeBanBackground() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('meme_ban_backgrounds')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meme-ban-backgrounds'] });
    },
  });
}

// Delete a meme ban background
export function useDeleteMemeBanBackground() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meme_ban_backgrounds')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meme-ban-backgrounds'] });
      toast.success('Background deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete background');
    },
  });
}
