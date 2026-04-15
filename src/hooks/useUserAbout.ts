import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface UserAbout {
  id: string;
  user_id: string;
  mbti: string | null;
  height: string | null;
  favorite_food: string | null;
  music_genres: string[];
  streaming_services: string[];
  now_listening_title: string | null;
  now_listening_artist: string | null;
  now_listening_cover_url: string | null;
  now_listening_service: string | null;
  now_watching_title: string | null;
  now_watching_service: string | null;
  now_watching_cover_url: string | null;
  show_age: boolean;
}

export type UserAboutInput = Partial<Omit<UserAbout, 'id' | 'user_id'>>;

export function useUserAbout(profileId: string | undefined) {
  return useQuery({
    queryKey: ['user-about', profileId],
    queryFn: async (): Promise<UserAbout | null> => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from('user_about' as any)
        .select('*')
        .eq('user_id', profileId)
        .maybeSingle();
      if (error) throw error;
      return data as UserAbout | null;
    },
    enabled: !!profileId,
    staleTime: 2 * 60_000,
  });
}

export function useUpdateUserAbout() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UserAboutInput) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Upsert — insert if not exists, update if exists
      const { data, error } = await supabase
        .from('user_about' as any)
        .upsert(
          { user_id: profile.id, ...input },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-about', profile?.id] });
    },
  });
}
