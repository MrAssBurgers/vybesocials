import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { tokenAccountGuard, tokenMarketplaceRequest } from '@/lib/tokenMarketplaceService';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';

/** The server deduplicates each authenticated account's UTC-day login reward. */
export function useDailyLoginChallenge() {
  const { user, profile } = useAuth();
  const triggered = useRef(new Set<string>());
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user?.id || !profile?.id || profile.user_id !== user.id) return;
    const guard = tokenAccountGuard(user.id);
    let cancelled = false;
    const check = () => { guard(); if (cancelled) throw new Error('Login view changed'); };
    const attempt = async () => {
      const day = new Date().toISOString().slice(0, 10);
      const key = `${user.id}:${day}`;
      if (triggered.current.has(key)) return;
      triggered.current.add(key);
      try {
        check();
        await tokenMarketplaceRequest({ action: 'earn', type: 'daily_login' }, check);
        check();
        void queryClient.invalidateQueries({ queryKey: ['token-marketplace', user.id] });
        recordChallengeActivity(profile.id, 'daily_login');
      } catch { triggered.current.delete(key); }
    };
    void attempt();
    // Recheck after midnight or a transient service failure without rapid retries.
    const timer = setInterval(() => { void attempt(); }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id, profile?.id, profile?.user_id, queryClient]);
}
