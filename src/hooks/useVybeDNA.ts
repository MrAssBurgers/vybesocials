import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface VybeDNA {
  id: string;
  user_id: string;
  signature_colors: string[];
  glyph_pattern: string;
  aura_intensity: number;
  personality_vector: Record<string, number>;
  generated_at: string;
  updated_at: string;
}

const GLYPH_PATTERNS = ['wave', 'spiral', 'burst', 'pulse', 'orbit', 'fractal', 'mesh', 'aurora'];

/**
 * Generate a unique visual DNA based on user activity and preferences
 */
function generateDNA(activityScore: number, socialScore: number, creativeScore: number): Partial<VybeDNA> {
  // Generate signature colors based on personality scores
  const hue1 = Math.floor((activityScore * 360) % 360);
  const hue2 = (hue1 + 60 + Math.floor(socialScore * 60)) % 360;
  const hue3 = (hue2 + 60 + Math.floor(creativeScore * 60)) % 360;
  
  const signature_colors = [
    `hsl(${hue1}, 70%, 60%)`,
    `hsl(${hue2}, 80%, 55%)`,
    `hsl(${hue3}, 75%, 50%)`
  ];
  
  // Select glyph pattern based on dominant trait
  const dominant = Math.max(activityScore, socialScore, creativeScore);
  const patternIndex = Math.floor((dominant * GLYPH_PATTERNS.length) % GLYPH_PATTERNS.length);
  
  return {
    signature_colors,
    glyph_pattern: GLYPH_PATTERNS[patternIndex],
    aura_intensity: (activityScore + socialScore + creativeScore) / 3,
    personality_vector: { activity: activityScore, social: socialScore, creative: creativeScore }
  };
}

export function useVybeDNA(userId?: string) {
  const { user } = useAuth();
  const targetId = userId || user?.id;

  return useQuery({
    queryKey: ['vybe-dna', targetId],
    queryFn: async (): Promise<VybeDNA | null> => {
      if (!targetId) return null;

      const { data, error } = await supabase
        .from('vybe_dna' as any)
        .select('*')
        .eq('user_id', targetId)
        .maybeSingle();

      if (error) throw error;
      return data as VybeDNA | null;
    },
    enabled: !!targetId,
    staleTime: 60_000,
  });
}

export function useGenerateVybeDNA() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (scores?: { activity: number; social: number; creative: number }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Use provided scores or generate random ones for demo
      const activityScore = scores?.activity ?? Math.random();
      const socialScore = scores?.social ?? Math.random();
      const creativeScore = scores?.creative ?? Math.random();

      const dna = generateDNA(activityScore, socialScore, creativeScore);

      const { data, error } = await supabase
        .from('vybe_dna' as any)
        .upsert({
          user_id: user.id,
          ...dna,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data as VybeDNA;
    },
    onSuccess: (data) => {
      qc.setQueryData(['vybe-dna', user?.id], data);
    },
  });
}

export function useUpdateVybeDNA() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<VybeDNA>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('vybe_dna' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as VybeDNA;
    },
    onSuccess: (data) => {
      qc.setQueryData(['vybe-dna', user?.id], data);
    },
  });
}
