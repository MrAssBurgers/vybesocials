import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDocument, documentRef } from '@/lib/firebase/firestoreDb';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { isVybeScoreUiEnabled } from '@/lib/relationshipFeatureFlags';
import { invokeFunction } from '@/lib/firebase/functionsService';

export interface VybeScoreDoc {
  score?: number;
  total_score?: number;
  social_score?: number;
  creator_score?: number;
  connection_score?: number;
  streak_score?: number;
  challenge_score?: number;
  community_score?: number;
}

export interface VybeScoreEvent {
  id: string;
  event_type?: string;
  action?: string;
  points: number;
  category?: string;
  created_at: string;
}

export function useVybeScore(profileId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['vybe-score', profileId],
    queryFn: async () => {
      if (!profileId) return 0;
      const doc = await getDocument<VybeScoreDoc>('vybe_scores', profileId);
      return Number(doc?.total_score ?? doc?.score ?? 0);
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!profileId) return;
    const ref = documentRef('vybe_scores', profileId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as VybeScoreDoc;
      qc.setQueryData(['vybe-score', profileId], Number(data.total_score ?? data.score ?? 0));
    });
    return () => unsub();
  }, [profileId, qc]);

  return query;
}

export function useVybeScoreBreakdown(profileId: string | undefined) {
  const { profile } = useAuth();
  const isOwn = !!profile && profile.id === profileId;

  return useQuery({
    queryKey: ['vybe-score-breakdown', profileId],
    queryFn: async (): Promise<{
      today: number;
      topActions: { action: string; points: number }[];
      categories: Record<string, number>;
    }> => {
      if (!profileId) return { today: 0, topActions: [], categories: {} };
      const scoreDoc = await getDocument<VybeScoreDoc>('vybe_scores', profileId);
      const categories = {
        social: Number(scoreDoc?.social_score || 0),
        creator: Number(scoreDoc?.creator_score || 0),
        connection: Number(scoreDoc?.connection_score || 0),
        streak: Number(scoreDoc?.streak_score || 0),
        challenge: Number(scoreDoc?.challenge_score || 0),
        community: Number(scoreDoc?.community_score || 0),
      };
      return { today: 0, topActions: [], categories };
    },
    enabled: !!profileId && isOwn && isVybeScoreUiEnabled(),
    staleTime: 60_000,
  });
}

export function useVybeScorePrivacy(profileId: string | undefined) {
  return useQuery({
    queryKey: ['vybe-score-privacy', profileId],
    queryFn: async () => {
      if (!profileId) return 'public' as const;
      const doc = await getDocument<{ privacy?: string }>('vybe_score_preferences', profileId);
      const privacy = doc?.privacy;
      if (privacy === 'friends_only' || privacy === 'private') return privacy;
      return 'public' as const;
    },
    enabled: Boolean(profileId),
    staleTime: 60_000,
  });
}

export async function updateVybeScorePrivacy(
  privacy: 'public' | 'friends_only' | 'private',
): Promise<void> {
  await invokeFunction('updateVybeScorePreferences', { privacy });
}

export function formatVybeScore(n: number): string {
  if (n < 10_000) return new Intl.NumberFormat().format(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
