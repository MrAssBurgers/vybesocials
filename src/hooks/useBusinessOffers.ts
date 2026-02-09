import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useUserBusiness() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-business', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('business_profiles')
        .select('id, name, slug, stripe_account_id, stripe_onboarding_complete')
        .eq('owner_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useConversationOffers(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-offers', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('business_offers')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId,
  });
}
