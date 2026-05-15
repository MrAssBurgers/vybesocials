import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { getPaymentClientContext, openCheckoutUrl } from '@/lib/platformPayments';

const TIP_AMOUNTS = [2, 5, 10, 25, 50, 100];

export { TIP_AMOUNTS };

export function useSendTip() {
  const [isLoading, setIsLoading] = useState(false);

  const sendTip = useCallback(async (creatorId: string, amount: number, message?: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-tip', {
        body: { creator_id: creatorId, amount, message, ...getPaymentClientContext() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.url) {
        openCheckoutUrl(data.url);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create tip');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sendTip, isLoading };
}

export function useMyTipsGiven() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tips-given', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('tips')
        .select('*')
        .eq('tipper_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
}
