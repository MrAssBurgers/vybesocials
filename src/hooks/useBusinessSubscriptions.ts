import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface BusinessTier {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  features: string[];
  rc_product_id: string | null;
  visibility_boost_multiplier: number;
  analytics_level: string;
  max_products: number | null;
  max_ad_credits_monthly: number;
  promo_tools_enabled: boolean;
  priority_support: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface BusinessSubscription {
  id: string;
  business_id: string;
  tier_id: string;
  status: string;
  rc_subscription_id: string | null;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  tier?: BusinessTier;
}

/** Fetch all active business subscription tiers */
export function useBusinessTiers() {
  return useQuery({
    queryKey: ['business-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        features: Array.isArray(t.features) ? t.features : [],
      })) as BusinessTier[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Admin: fetch all tiers including inactive */
export function useAllBusinessTiers() {
  return useQuery({
    queryKey: ['business-tiers-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_subscription_tiers')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        features: Array.isArray(t.features) ? t.features : [],
      })) as BusinessTier[];
    },
  });
}

/** Admin: create/update a tier */
export function useUpsertTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tier: Partial<BusinessTier> & { name: string; slug: string; price_monthly: number }) => {
      const payload = {
        ...tier,
        features: JSON.stringify(tier.features || []),
        updated_at: new Date().toISOString(),
      };
      if (tier.id) {
        const { error } = await supabase
          .from('business_subscription_tiers')
          .update(payload as any)
          .eq('id', tier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('business_subscription_tiers')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-tiers'] });
      qc.invalidateQueries({ queryKey: ['business-tiers-all'] });
      toast.success('Tier saved');
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Get the current business's subscription */
export function useMyBusinessSubscription(businessId: string | null) {
  return useQuery({
    queryKey: ['business-subscription', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_subscriptions')
        .select('*, tier:business_subscription_tiers(*)')
        .eq('business_id', businessId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        tier: data.tier ? {
          ...data.tier,
          features: Array.isArray(data.tier.features) ? data.tier.features : [],
        } : undefined,
      } as BusinessSubscription;
    },
    enabled: !!businessId,
  });
}

/** Subscribe a business to a tier */
export function useSubscribeBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ businessId, tierId }: { businessId: string; tierId: string }) => {
      // Upsert: one subscription per business
      const { error } = await supabase
        .from('business_subscriptions')
        .upsert({
          business_id: businessId,
          tier_id: tierId,
          status: 'active',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'business_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-subscription'] });
      toast.success('Subscription activated!');
    },
    onError: (e) => toast.error(e.message),
  });
}
