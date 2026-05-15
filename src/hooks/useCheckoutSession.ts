import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getPaymentClientContext, openCheckoutUrl } from '@/lib/platformPayments';

export function useCheckoutSession() {
  const [isLoading, setIsLoading] = useState(false);

  const createCheckout = useCallback(async (priceId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { price_id: priceId, ...getPaymentClientContext() },
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
      toast.error(err.message || 'Failed to start checkout');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createCheckout, isLoading };
}
