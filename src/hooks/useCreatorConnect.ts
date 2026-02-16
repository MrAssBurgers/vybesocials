import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function useCreatorConnectStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-connect-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-creator-connect');
      if (error) throw error;
      return data as {
        connected: boolean;
        onboarding_complete: boolean;
        charges_enabled?: boolean;
        payouts_enabled?: boolean;
        details_submitted?: boolean;
        stripe_not_configured?: boolean;
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 10_000,
  });
}

export function useCreatorConnectOnboard() {
  const [isLoading, setIsLoading] = useState(false);

  const startOnboarding = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-creator-connect');
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      toast.error('Failed to start payout setup');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { startOnboarding, isLoading };
}

export function useProcessCreatorPayout() {
  const [isLoading, setIsLoading] = useState(false);

  const processPayout = useCallback(async (amount: number) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-creator-payout', {
        body: { amount },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return false;
      }
      toast.success('Payout processing!');
      return true;
    } catch (err) {
      toast.error('Failed to process payout');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { processPayout, isLoading };
}
