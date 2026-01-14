import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  bgMain: string;
  bgCard: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  bgGradientMid?: string;
  sidebarBg?: string;
  navBg?: string;
  inputBg?: string;
  glassBg?: string;
  glassBorder?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: 'small' | 'medium' | 'large';
  mode: 'light' | 'dark';
  themeName?: string;
  // Neon/accent colors for highlights
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
}

export const THEME_PRESETS: Record<string, ThemeTokens> = {
  classic: {
    colorPrimary: '330 100% 60%',
    colorSecondary: '240 10% 12%',
    colorAccent: '185 100% 50%',
    bgMain: '240 10% 4%',
    bgCard: '240 10% 6%',
    bgGradientFrom: '240 10% 4%',
    bgGradientMid: '240 10% 8%',
    bgGradientTo: '240 10% 4%',
    glassBg: '240 10% 10%',
    glassBorder: '240 10% 20%',
    sidebarBg: '240 10% 6%',
    navBg: '240 10% 6%',
    inputBg: '240 10% 18%',
    textPrimary: '0 0% 98%',
    textSecondary: '240 5% 55%',
    borderColor: '240 10% 18%',
    borderRadius: 'medium',
    mode: 'dark',
    neonPink: '330 100% 60%',
    neonPurple: '280 100% 60%',
    neonCyan: '185 100% 50%',
  },
  midnight: {
    colorPrimary: '220 90% 56%',
    colorSecondary: '230 25% 18%',
    colorAccent: '200 100% 62%',
    bgMain: '230 25% 8%',
    bgCard: '230 20% 14%',
    bgGradientFrom: '230 25% 6%',
    bgGradientMid: '230 30% 12%',
    bgGradientTo: '230 25% 8%',
    glassBg: '230 20% 12%',
    glassBorder: '230 20% 22%',
    sidebarBg: '230 25% 10%',
    navBg: '230 25% 10%',
    inputBg: '230 20% 20%',
    textPrimary: '210 40% 98%',
    textSecondary: '215 20% 65%',
    borderColor: '230 20% 22%',
    borderRadius: 'medium',
    mode: 'dark',
    neonPink: '220 90% 56%',
    neonPurple: '260 80% 60%',
    neonCyan: '200 100% 62%',
  },
  neon: {
    colorPrimary: '330 100% 60%',
    colorSecondary: '280 100% 50%',
    colorAccent: '160 100% 50%',
    bgMain: '270 50% 6%',
    bgCard: '270 40% 12%',
    bgGradientFrom: '280 60% 4%',
    bgGradientMid: '300 50% 10%',
    bgGradientTo: '260 50% 6%',
    glassBg: '270 40% 15%',
    glassBorder: '280 50% 30%',
    sidebarBg: '270 45% 10%',
    navBg: '270 45% 10%',
    inputBg: '270 35% 18%',
    textPrimary: '0 0% 100%',
    textSecondary: '270 30% 70%',
    borderColor: '280 50% 30%',
    borderRadius: 'large',
    mode: 'dark',
    neonPink: '330 100% 65%',
    neonPurple: '280 100% 60%',
    neonCyan: '160 100% 50%',
  },
  soft: {
    colorPrimary: '340 65% 55%',
    colorSecondary: '200 50% 85%',
    colorAccent: '160 50% 50%',
    bgMain: '30 30% 96%',
    bgCard: '0 0% 100%',
    bgGradientFrom: '30 30% 98%',
    bgGradientMid: '340 20% 96%',
    bgGradientTo: '30 30% 96%',
    glassBg: '0 0% 100%',
    glassBorder: '240 5% 90%',
    sidebarBg: '0 0% 98%',
    navBg: '0 0% 98%',
    inputBg: '240 5% 92%',
    textPrimary: '240 10% 20%',
    textSecondary: '240 5% 50%',
    borderColor: '240 5% 85%',
    borderRadius: 'large',
    mode: 'light',
    neonPink: '340 65% 55%',
    neonPurple: '280 50% 60%',
    neonCyan: '160 50% 50%',
  },
  cyberpunk: {
    colorPrimary: '55 100% 50%',
    colorSecondary: '330 100% 50%',
    colorAccent: '180 100% 50%',
    bgMain: '240 20% 4%',
    bgCard: '240 15% 10%',
    bgGradientFrom: '240 25% 3%',
    bgGradientMid: '280 30% 8%',
    bgGradientTo: '240 20% 5%',
    glassBg: '240 20% 12%',
    glassBorder: '55 80% 30%',
    sidebarBg: '240 18% 8%',
    navBg: '240 18% 8%',
    inputBg: '240 15% 16%',
    textPrimary: '55 100% 90%',
    textSecondary: '55 50% 60%',
    borderColor: '55 60% 25%',
    borderRadius: 'small',
    mode: 'dark',
    neonPink: '330 100% 55%',
    neonPurple: '280 100% 60%',
    neonCyan: '180 100% 50%',
  },
  minimal: {
    colorPrimary: '0 0% 15%',
    colorSecondary: '0 0% 85%',
    colorAccent: '0 0% 40%',
    bgMain: '0 0% 100%',
    bgCard: '0 0% 98%',
    bgGradientFrom: '0 0% 100%',
    bgGradientMid: '0 0% 98%',
    bgGradientTo: '0 0% 100%',
    glassBg: '0 0% 100%',
    glassBorder: '0 0% 90%',
    sidebarBg: '0 0% 98%',
    navBg: '0 0% 98%',
    inputBg: '0 0% 95%',
    textPrimary: '0 0% 10%',
    textSecondary: '0 0% 45%',
    borderColor: '0 0% 88%',
    borderRadius: 'small',
    mode: 'light',
    neonPink: '0 0% 30%',
    neonPurple: '0 0% 40%',
    neonCyan: '0 0% 50%',
  },
};

const BORDER_RADIUS_MAP = {
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
};

export function useUserTheme() {
  const { user } = useAuth();
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
  
  // Smooth transition for all changes
  root.style.transition = 'all 0.4s ease';
  
  // === PRIMARY COLORS ===
  root.style.setProperty('--primary', tokens.colorPrimary);
  root.style.setProperty('--secondary', tokens.colorSecondary);
  root.style.setProperty('--accent', tokens.colorAccent);
  root.style.setProperty('--ring', tokens.colorPrimary);
  
  // === BACKGROUNDS - The main ones that need to change ===
  root.style.setProperty('--background', tokens.bgMain);
  root.style.setProperty('--card', tokens.bgCard);
  root.style.setProperty('--popover', tokens.bgCard);
  
  // Gradient backgrounds
  const gradientFrom = tokens.bgGradientFrom || tokens.bgMain;
  const gradientMid = tokens.bgGradientMid || tokens.bgCard;
  const gradientTo = tokens.bgGradientTo || tokens.bgMain;
  root.style.setProperty('--gradient-start', tokens.colorPrimary);
  root.style.setProperty('--gradient-mid', tokens.colorSecondary);
  root.style.setProperty('--gradient-end', tokens.colorAccent);
  
  // Glass effects - critical for removing "black barriers"
  const glassBg = tokens.glassBg || tokens.bgCard;
  const glassBorder = tokens.glassBorder || tokens.borderColor || (tokens.mode === 'dark' ? '240 10% 20%' : '240 5% 90%');
  root.style.setProperty('--glass', glassBg);
  root.style.setProperty('--glass-border', glassBorder);
  
  // Muted backgrounds
  const mutedBg = tokens.mode === 'dark' 
    ? adjustLightness(tokens.bgCard, 5) 
    : adjustLightness(tokens.bgCard, -5);
  root.style.setProperty('--muted', mutedBg);
  
  // === SIDEBAR ===
  const sidebarBg = tokens.sidebarBg || tokens.bgCard;
  root.style.setProperty('--sidebar-background', sidebarBg);
  root.style.setProperty('--sidebar-foreground', tokens.textPrimary);
  root.style.setProperty('--sidebar-primary', tokens.colorPrimary);
  root.style.setProperty('--sidebar-primary-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  root.style.setProperty('--sidebar-accent', tokens.colorSecondary);
  root.style.setProperty('--sidebar-accent-foreground', tokens.textPrimary);
  root.style.setProperty('--sidebar-border', tokens.borderColor || glassBorder);
  root.style.setProperty('--sidebar-ring', tokens.colorPrimary);
  
  // === TEXT COLORS ===
  root.style.setProperty('--foreground', tokens.textPrimary);
  root.style.setProperty('--muted-foreground', tokens.textSecondary);
  root.style.setProperty('--card-foreground', tokens.textPrimary);
  root.style.setProperty('--popover-foreground', tokens.textPrimary);
  root.style.setProperty('--primary-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  root.style.setProperty('--secondary-foreground', tokens.textPrimary);
  root.style.setProperty('--accent-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
  
  // === BORDERS & INPUTS ===
  const borderColor = tokens.borderColor || (tokens.mode === 'dark' ? '240 10% 18%' : '240 5% 85%');
  const inputBg = tokens.inputBg || borderColor;
  root.style.setProperty('--border', borderColor);
  root.style.setProperty('--input', inputBg);
  
  // === NEON/ACCENT COLORS ===
  root.style.setProperty('--neon-pink', tokens.neonPink || tokens.colorPrimary);
  root.style.setProperty('--neon-purple', tokens.neonPurple || tokens.colorSecondary);
  root.style.setProperty('--neon-cyan', tokens.neonCyan || tokens.colorAccent);
  
  // === CHART COLORS ===
  root.style.setProperty('--chart-1', tokens.colorPrimary);
  root.style.setProperty('--chart-2', tokens.colorSecondary);
  root.style.setProperty('--chart-3', tokens.colorAccent);
  root.style.setProperty('--chart-4', tokens.neonPink || tokens.colorPrimary);
  root.style.setProperty('--chart-5', tokens.neonCyan || tokens.colorAccent);
  
  // === BORDER RADIUS ===
  root.style.setProperty('--radius', BORDER_RADIUS_MAP[tokens.borderRadius]);
  
  // === LIGHT MODE SPECIFIC ===
  if (tokens.mode === 'light') {
    root.style.setProperty('--light-bg-start', gradientFrom);
    root.style.setProperty('--light-bg-mid', gradientMid);
  }
  
  // === UPDATE BODY BACKGROUND DIRECTLY ===
  // This ensures the gradient background changes too
  const bodyGradient = `linear-gradient(160deg, hsl(${gradientFrom}) 0%, hsl(${gradientMid}) 50%, hsl(${gradientTo}) 100%)`;
  document.body.style.background = bodyGradient;
  document.body.style.transition = 'background 0.4s ease';
  
  // === MODE CLASS ===
  root.classList.remove('light', 'dark');
  root.classList.add(tokens.mode);
  
  // Remove transition after applied
  setTimeout(() => {
    root.style.transition = '';
  }, 500);
}

// Helper to adjust HSL lightness
function adjustLightness(hsl: string, amount: number): string {
  const parts = hsl.split(' ');
  if (parts.length >= 3) {
    const lightness = parseFloat(parts[2].replace('%', ''));
    const newLightness = Math.max(0, Math.min(100, lightness + amount));
    return `${parts[0]} ${parts[1]} ${newLightness}%`;
  }
  return hsl;
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
