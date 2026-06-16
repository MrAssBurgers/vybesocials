import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useEffect, useState, useCallback } from 'react';

export type MoodType = 'energetic' | 'chill' | 'focused' | 'social' | 'creative' | 'neutral';

export interface MoodState {
  id: string;
  user_id: string;
  mood: MoodType;
  intensity: number;
  source: 'manual' | 'activity' | 'time' | 'content';
  detected_at: string;
}

// Mood to UI mapping
export const MOOD_THEMES: Record<MoodType, {
  gradient: string;
  accent: string;
  animation: string;
  emoji: string;
}> = {
  energetic: {
    gradient: 'from-orange-500 via-red-500 to-pink-500',
    accent: 'hsl(25, 95%, 53%)',
    animation: 'pulse',
    emoji: '⚡',
  },
  chill: {
    gradient: 'from-blue-400 via-cyan-400 to-teal-400',
    accent: 'hsl(190, 90%, 50%)',
    animation: 'float',
    emoji: '🌊',
  },
  focused: {
    gradient: 'from-purple-500 via-indigo-500 to-blue-600',
    accent: 'hsl(250, 80%, 55%)',
    animation: 'none',
    emoji: '🎯',
  },
  social: {
    gradient: 'from-pink-500 via-rose-500 to-red-500',
    accent: 'hsl(340, 82%, 52%)',
    animation: 'bounce',
    emoji: '💬',
  },
  creative: {
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    accent: 'hsl(280, 85%, 55%)',
    animation: 'wiggle',
    emoji: '🎨',
  },
  neutral: {
    gradient: 'from-gray-400 via-slate-500 to-gray-600',
    accent: 'hsl(220, 14%, 50%)',
    animation: 'none',
    emoji: '😌',
  },
};

export function useCurrentMood() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-mood', user?.id],
    queryFn: async (): Promise<MoodState | null> => {
      if (!user?.id) return null;

      const { data, error } = await db
        .from('mood_states' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as MoodState | null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useSetMood() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ mood, intensity = 0.7, source = 'manual' }: { 
      mood: MoodType; 
      intensity?: number; 
      source?: MoodState['source'] 
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await db
        .from('mood_states' as any)
        .insert({
          user_id: user.id,
          mood,
          intensity,
          source,
          detected_at: new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as MoodState;
    },
    onSuccess: (data) => {
      qc.setQueryData(['current-mood', user?.id], data);
    },
  });
}

/**
 * Detects mood based on user activity patterns
 */
export function useMoodDetection() {
  const { user } = useAuth();
  const setMood = useSetMood();
  const [lastDetection, setLastDetection] = useState<number>(0);

  const detectMood = useCallback(async () => {
    if (!user?.id) return;
    
    // Prevent detection spam (max once per 5 minutes)
    const now = Date.now();
    if (now - lastDetection < 5 * 60 * 1000) return;
    setLastDetection(now);

    const hour = new Date().getHours();
    let detectedMood: MoodType = 'neutral';
    
    // Time-based detection
    if (hour >= 6 && hour < 10) {
      detectedMood = 'energetic'; // Morning energy
    } else if (hour >= 10 && hour < 14) {
      detectedMood = 'focused'; // Work hours
    } else if (hour >= 14 && hour < 18) {
      detectedMood = 'creative'; // Afternoon creativity
    } else if (hour >= 18 && hour < 22) {
      detectedMood = 'social'; // Evening social
    } else {
      detectedMood = 'chill'; // Night wind-down
    }

    setMood.mutate({ mood: detectedMood, source: 'time' });
  }, [user?.id, lastDetection, setMood]);

  return { detectMood };
}

/**
 * Applies mood-based theme modifications to the UI
 */
export function useMoodTheme() {
  const { data: mood } = useCurrentMood();
  const theme = mood ? MOOD_THEMES[mood.mood as MoodType] : MOOD_THEMES.neutral;

  useEffect(() => {
    if (!mood) return;

    const root = document.documentElement;
    root.style.setProperty('--mood-accent', theme.accent);
    root.setAttribute('data-mood', mood.mood);
    root.setAttribute('data-mood-intensity', String(mood.intensity));

    return () => {
      root.style.removeProperty('--mood-accent');
      root.removeAttribute('data-mood');
      root.removeAttribute('data-mood-intensity');
    };
  }, [mood, theme]);

  return { mood: mood?.mood as MoodType ?? 'neutral', theme, intensity: mood?.intensity ?? 0.5 };
}
