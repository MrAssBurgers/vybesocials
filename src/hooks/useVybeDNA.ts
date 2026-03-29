import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';

export interface VybeDNA {
  id: string;
  user_id: string;
  signature_colors: string[];
  glyph_pattern: string;
  aura_intensity: number;
  personality_vector: Record<string, number>;
  watch_time_avg: number;
  session_time_avg: number;
  active_hours: Array<{ hour: number; count: number }>;
  engagement_score: number;
  interests: string[];
  generated_at: string;
  updated_at: string;
}

const GLYPH_PATTERNS = ['wave', 'spiral', 'burst', 'pulse', 'orbit', 'fractal', 'mesh', 'aurora'];

/**
 * Derive visual properties (colors, glyph) from personality scores.
 * Called client-side after the RPC returns the updated personality_vector.
 */
function deriveVisuals(pv: Record<string, number>): { signature_colors: string[]; glyph_pattern: string } {
  const a = pv.activity ?? 0;
  const s = pv.social ?? 0;
  const c = pv.creative ?? 0;

  const hue1 = Math.floor((a * 360) % 360);
  const hue2 = (hue1 + 60 + Math.floor(s * 60)) % 360;
  const hue3 = (hue2 + 60 + Math.floor(c * 60)) % 360;

  const signature_colors = [
    `hsl(${hue1}, 70%, 60%)`,
    `hsl(${hue2}, 80%, 55%)`,
    `hsl(${hue3}, 75%, 50%)`,
  ];

  const dominant = Math.max(a, s, c);
  const patternIndex = Math.floor((dominant * GLYPH_PATTERNS.length) % GLYPH_PATTERNS.length);

  return { signature_colors, glyph_pattern: GLYPH_PATTERNS[patternIndex] };
}

/**
 * Auto-compute DNA from real user activity via server RPC,
 * then fetch the full row with derived visuals.
 */
export function useVybeDNA(userId?: string) {
  const { user } = useAuth();
  const targetId = userId || user?.id;
  const qc = useQueryClient();
  const isOwnProfile = targetId === user?.id;

  // Auto-recompute own DNA on mount (every page visit, max once per query lifecycle)
  const computeQuery = useQuery({
    queryKey: ['vybe-dna-compute', targetId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('compute_vybe_dna');
      if (error) throw error;
      return data as Record<string, number>;
    },
    enabled: !!targetId && isOwnProfile,
    staleTime: 5 * 60_000, // recompute at most every 5 min
    refetchOnWindowFocus: false,
  });

  // Fetch the stored DNA row (works for own + other users)
  const dnaQuery = useQuery({
    queryKey: ['vybe-dna', targetId],
    queryFn: async (): Promise<VybeDNA | null> => {
      if (!targetId) return null;

      const { data, error } = await supabase
        .from('vybe_dna' as any)
        .select('*')
        .eq('user_id', targetId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as VybeDNA;
      const pv = row.personality_vector || {};
      const visuals = deriveVisuals(pv);

      return { ...row, ...visuals };
    },
    enabled: !!targetId && (isOwnProfile ? computeQuery.isSuccess : true),
    staleTime: 60_000,
  });

  return dnaQuery;
}

// Keep for backwards compat but make it a no-op that just triggers recompute
export function useGenerateVybeDNA() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return {
    mutate: () => {
      qc.invalidateQueries({ queryKey: ['vybe-dna-compute', user?.id] });
      qc.invalidateQueries({ queryKey: ['vybe-dna', user?.id] });
    },
    isPending: false,
  };
}
