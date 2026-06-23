import { useCallback, useEffect, useState } from 'react';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { useAuth } from '@/lib/auth';

export interface AiUsageBucket {
  used: number;
  limit: number;
}

export interface AiUsageState {
  loading: boolean;
  chat: AiUsageBucket;
  assist: AiUsageBucket;
  smart_replies: AiUsageBucket;
  image_gen: AiUsageBucket;
  hasByok: boolean;
  isPremium: boolean;
  providers: { google: boolean; openai: boolean };
}

const DEFAULT: AiUsageState = {
  loading: true,
  chat: { used: 0, limit: 25 },
  assist: { used: 0, limit: 15 },
  smart_replies: { used: 0, limit: 20 },
  image_gen: { used: 0, limit: 5 },
  hasByok: false,
  isPremium: false,
  providers: { google: false, openai: false },
};

export function useAiUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<AiUsageState>(DEFAULT);

  const refresh = useCallback(async () => {
    if (!user) {
      setUsage({ ...DEFAULT, loading: false });
      return;
    }
    try {
      const { data, error } = await invokeFunction<{
        chat?: AiUsageBucket;
        assist?: AiUsageBucket;
        smart_replies?: AiUsageBucket;
        image_gen?: AiUsageBucket;
        hasByok?: boolean;
        isPremium?: boolean;
        providers?: { google: boolean; openai: boolean };
      }>('get-ai-usage');
      if (error) throw error;
      setUsage({
        loading: false,
        chat: data?.chat || DEFAULT.chat,
        assist: data?.assist || DEFAULT.assist,
        smart_replies: data?.smart_replies || DEFAULT.smart_replies,
        image_gen: data?.image_gen || DEFAULT.image_gen,
        hasByok: !!data?.hasByok,
        isPremium: !!data?.isPremium,
        providers: data?.providers || DEFAULT.providers,
      });
    } catch {
      setUsage((prev) => ({ ...prev, loading: false }));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    const onKeySaved = () => void refresh();
    window.addEventListener('vybe-ai-key-saved', onKeySaved);
    return () => window.removeEventListener('vybe-ai-key-saved', onKeySaved);
  }, [refresh]);

  const chatRemaining = Math.max(0, usage.chat.limit - usage.chat.used);
  const imageGenRemaining = Math.max(0, usage.image_gen.limit - usage.image_gen.used);
  const chatExhausted = !usage.hasByok && chatRemaining <= 0;
  const imageGenExhausted = !usage.hasByok && imageGenRemaining <= 0;

  return {
    usage,
    refresh,
    chatRemaining,
    imageGenRemaining,
    chatExhausted,
    imageGenExhausted,
  };
}
