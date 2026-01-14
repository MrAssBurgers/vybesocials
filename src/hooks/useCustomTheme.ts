import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  bgMain: string;
  bgCard: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  sidebarBg?: string;
  navBg?: string;
  inputBg?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: 'small' | 'medium' | 'large';
  mode: 'light' | 'dark';
  themeName?: string;
}

export const THEME_PRESETS: Record<string, ThemeTokens> = {
  classic: {
    colorPrimary: '262 83% 58%',
    colorSecondary: '240 4% 16%',
    colorAccent: '280 100% 70%',
    bgMain: '240 10% 4%',
    bgCard: '240 6% 10%',
    textPrimary: '0 0% 98%',
    textSecondary: '240 5% 65%',
    borderRadius: 'medium',
    mode: 'dark',
  },
  midnight: {
    colorPrimary: '220 90% 56%',
    colorSecondary: '230 25% 18%',
    colorAccent: '200 100% 62%',
    bgMain: '230 25% 8%',
    bgCard: '230 20% 14%',
    textPrimary: '210 40% 98%',
    textSecondary: '215 20% 65%',
    borderRadius: 'medium',
    mode: 'dark',
  },
  neon: {
    colorPrimary: '330 100% 60%',
    colorSecondary: '280 100% 50%',
    colorAccent: '160 100% 50%',
    bgMain: '270 50% 6%',
    bgCard: '270 40% 12%',
    textPrimary: '0 0% 100%',
    textSecondary: '270 30% 70%',
    borderRadius: 'large',
    mode: 'dark',
  },
  soft: {
    colorPrimary: '340 65% 65%',
    colorSecondary: '200 50% 75%',
    colorAccent: '160 50% 60%',
    bgMain: '30 30% 96%',
    bgCard: '0 0% 100%',
    textPrimary: '240 10% 20%',
    textSecondary: '240 5% 50%',
    borderRadius: 'large',
    mode: 'light',
  },
  cyberpunk: {
    colorPrimary: '55 100% 50%',
    colorSecondary: '330 100% 50%',
    colorAccent: '180 100% 50%',
    bgMain: '240 20% 4%',
    bgCard: '240 15% 10%',
    textPrimary: '55 100% 90%',
    textSecondary: '55 50% 60%',
    borderRadius: 'small',
    mode: 'dark',
  },
  minimal: {
    colorPrimary: '0 0% 15%',
    colorSecondary: '0 0% 30%',
    colorAccent: '0 0% 50%',
    bgMain: '0 0% 100%',
    bgCard: '0 0% 98%',
    textPrimary: '0 0% 10%',
    textSecondary: '0 0% 45%',
    borderRadius: 'small',
    mode: 'light',
  },
};

const BORDER_RADIUS_MAP = {
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
};

export function useUserTheme() {
  const { user, profile } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user-theme', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('user_themes')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60000,
  });
}

export function useSaveTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeTokens,
      themeName,
      basePreset,
    }: {
      themeTokens: ThemeTokens;
      themeName: string;
      basePreset: string;
    }) => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Upsert theme using on conflict
      const { error } = await supabase
        .from('user_themes')
        .upsert({
          user_id: userId,
          theme_name: themeName,
          theme_tokens: themeTokens as any,
          base_preset: basePreset,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-theme'] });
      toast.success('Theme saved!');
    },
    onError: (error: any) => {
      console.error('Failed to save theme:', error);
      toast.error('Failed to save theme');
    },
  });
}

export function useResetTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_themes')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-theme'] });
      // Reset to default theme
      applyThemeTokens(THEME_PRESETS.classic);
      toast.success('Theme reset to default');
    },
    onError: (error: any) => {
      console.error('Failed to reset theme:', error);
      toast.error('Failed to reset theme');
    },
  });
}

export function useGenerateTheme() {
  return useMutation({
    mutationFn: async ({
      prompt,
      basePreset = 'classic',
    }: {
      prompt: string;
      basePreset?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-theme', {
        body: { prompt, basePreset },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return data.theme as ThemeTokens & { themeName: string };
    },
    onError: (error: any) => {
      console.error('Failed to generate theme:', error);
      if (error.message?.includes('Rate limit')) {
        toast.error('Too many requests. Please wait a moment.');
      } else if (error.message?.includes('credits')) {
        toast.error('AI credits exhausted. Please add funds.');
      } else {
        toast.error('Failed to generate theme. Try again.');
      }
    },
  });
}

export function applyThemeTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  
  // Apply with smooth transition
  root.style.setProperty('--theme-transition', 'all 0.4s ease');
  
  // Core colors
  root.style.setProperty('--primary', tokens.colorPrimary);
  root.style.setProperty('--secondary', tokens.colorSecondary);
  root.style.setProperty('--accent', tokens.colorAccent);
  root.style.setProperty('--background', tokens.bgMain);
  root.style.setProperty('--card', tokens.bgCard);
  root.style.setProperty('--foreground', tokens.textPrimary);
  root.style.setProperty('--muted-foreground', tokens.textSecondary);
  
  // Extended background colors
  const sidebarBg = tokens.sidebarBg || tokens.bgCard;
  const navBg = tokens.navBg || tokens.bgCard;
  const inputBg = tokens.inputBg || (tokens.mode === 'dark' ? '240 4% 16%' : '240 6% 90%');
  const borderColor = tokens.borderColor || (tokens.mode === 'dark' ? '240 4% 16%' : '240 6% 90%');
  
  root.style.setProperty('--sidebar', sidebarBg);
  root.style.setProperty('--sidebar-foreground', tokens.textPrimary);
  root.style.setProperty('--sidebar-primary', tokens.colorPrimary);
  root.style.setProperty('--sidebar-accent', tokens.colorAccent);
  
  // Derived colors
  root.style.setProperty('--primary-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  root.style.setProperty('--secondary-foreground', tokens.textPrimary);
  root.style.setProperty('--accent-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  root.style.setProperty('--card-foreground', tokens.textPrimary);
  root.style.setProperty('--popover', tokens.bgCard);
  root.style.setProperty('--popover-foreground', tokens.textPrimary);
  root.style.setProperty('--muted', tokens.mode === 'dark' ? '240 4% 16%' : '240 5% 90%');
  root.style.setProperty('--border', borderColor);
  root.style.setProperty('--input', inputBg);
  root.style.setProperty('--ring', tokens.colorPrimary);
  
  // Destructive colors (keep consistent but tint slightly)
  root.style.setProperty('--destructive', '0 84% 60%');
  root.style.setProperty('--destructive-foreground', '0 0% 98%');
  
  // Chart colors based on theme
  root.style.setProperty('--chart-1', tokens.colorPrimary);
  root.style.setProperty('--chart-2', tokens.colorSecondary);
  root.style.setProperty('--chart-3', tokens.colorAccent);
  
  // Border radius
  root.style.setProperty('--radius', BORDER_RADIUS_MAP[tokens.borderRadius]);
  
  // Update color scheme
  root.classList.remove('light', 'dark');
  root.classList.add(tokens.mode);
  
  // Remove transition after applied
  setTimeout(() => {
    root.style.removeProperty('--theme-transition');
  }, 500);
}

export function useApplyUserTheme() {
  const { data: userTheme } = useUserTheme();

  useEffect(() => {
    if (userTheme?.is_active && userTheme.theme_tokens) {
      const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
      applyThemeTokens(tokens);
    }
  }, [userTheme]);
}
