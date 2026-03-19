import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface DNAContentPreferences {
  boost_topics: string[];
  reduce_topics: string[];
  preferred_content_types: string[];
  discovery_level: 'conservative' | 'balanced' | 'adventurous';
}

export function useDNAPreferences() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dna-content-preferences', user?.id],
    queryFn: async (): Promise<DNAContentPreferences | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('dna_content_preferences' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return data as unknown as DNAContentPreferences;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}
