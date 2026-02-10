import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StripeConfig {
  stripe_enabled: boolean;
  stripe_mode: string;
  stripe_publishable_key: string | null;
}

/**
 * Hook to check if Stripe is enabled and get the publishable key.
 * Uses the is_stripe_enabled() DB function for non-admin users,
 * or the full config for admins.
 */
export function useStripeConfig() {
  return useQuery({
    queryKey: ['stripe-config-status'],
    queryFn: async (): Promise<StripeConfig> => {
      // Try to read full config (will fail for non-admins due to RLS)
      const { data, error } = await supabase
        .from('stripe_config')
        .select('stripe_enabled, stripe_mode, stripe_publishable_key')
        .limit(1)
        .maybeSingle();

      if (data) {
        return {
          stripe_enabled: data.stripe_enabled,
          stripe_mode: data.stripe_mode,
          stripe_publishable_key: data.stripe_publishable_key,
        };
      }

      // Fallback for non-admins: use the security definer function
      const { data: enabledData } = await supabase.rpc('is_stripe_enabled');
      return {
        stripe_enabled: !!enabledData,
        stripe_mode: 'unknown',
        stripe_publishable_key: null,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Runtime guard: logs warnings and returns whether Stripe is ready.
 */
export function useStripeReady() {
  const { data: config, isLoading } = useStripeConfig();

  const isReady = !isLoading && config?.stripe_enabled === true;

  if (!isLoading && !config?.stripe_enabled) {
    console.warn('[Stripe] Stripe is disabled in platform settings. Payment features will not function.');
  }

  return { isReady, isLoading, config };
}
