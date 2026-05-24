import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { addPassToWallet, walletErrorMessage, type AddPassResult } from '@/lib/despiaWallet';
import { isDespiaRuntime } from '@/lib/despiaBridge';

export function useWalletPass() {
  const [isPresenting, setIsPresenting] = useState(false);
  const [lastResult, setLastResult] = useState<AddPassResult | null>(null);

  const addPass = useCallback(async (url: string): Promise<AddPassResult> => {
    setIsPresenting(true);
    try {
      const result = await addPassToWallet(url);
      setLastResult(result);
      if (result.ok && !result.dismissed) {
        toast.success('Pass added to wallet');
      } else if (result.dismissed) {
        // Quiet — user explicitly cancelled.
      } else if (result.error) {
        toast.error(walletErrorMessage(result.error));
      }
      return result;
    } finally {
      setIsPresenting(false);
    }
  }, []);

  return {
    isAvailable: isDespiaRuntime(),
    isPresenting,
    lastResult,
    addPass,
  };
}
