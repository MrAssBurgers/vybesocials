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
  inputText?: string; // Text color inside input fields for proper contrast
  buttonText?: string; // Text color on primary buttons for proper contrast
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
  // Animation settings
  animationSpeed?: 'slow' | 'normal' | 'fast' | 'instant';
  animationStyle?: 'smooth' | 'bouncy' | 'snappy' | 'none';
  // Background image and effects (AI-generated)
  backgroundImage?: string; // URL to background image
  backgroundEffect?: 'none' | 'particles' | 'stars' | 'bubbles' | 'aurora' | 'rain' | 'snow' | 'fireflies' | 'geometric';
  backgroundOverlay?: string; // HSL color for overlay
  backgroundBlur?: number; // 0-20 blur amount
  backgroundOpacity?: number; // 0-100 opacity of bg image
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

// Helper to safely get HSL value with fallback
function safeHSL(value: string | undefined, fallback: string): string {
  if (!value || typeof value !== 'string') return fallback;
  // Basic validation - should have at least a number
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return fallback;
  return trimmed;
}

// Helper to adjust HSL lightness
function adjustLightness(hsl: string, amount: number): string {
  try {
    const parts = hsl.split(' ');
    if (parts.length >= 3) {
      const lightness = parseFloat(parts[2].replace('%', ''));
      if (isNaN(lightness)) return hsl;
      const newLightness = Math.max(0, Math.min(100, lightness + amount));
      return `${parts[0]} ${parts[1]} ${newLightness}%`;
    }
  } catch {
    // Return original if parsing fails
  }
  return hsl;
}

export function applyThemeTokens(tokens: ThemeTokens) {
  if (!tokens || typeof tokens !== 'object') {
    console.error('Invalid theme tokens provided');
    return;
  }

  try {
    const root = document.documentElement;
    
    // Default fallbacks for critical values
    const defaultDark = '240 10% 4%';
    const defaultLight = '0 0% 98%';
    const defaultPrimary = '330 100% 60%';
    const defaultText = tokens.mode === 'dark' ? '0 0% 98%' : '240 10% 20%';
    const defaultMuted = tokens.mode === 'dark' ? '240 5% 55%' : '240 5% 50%';
    const defaultBg = tokens.mode === 'dark' ? defaultDark : defaultLight;
    
    // Use requestAnimationFrame for smoother updates - no transition on root to prevent lag
    
    // === PRIMARY COLORS ===
    root.style.setProperty('--primary', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--secondary', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--accent', safeHSL(tokens.colorAccent, '185 100% 50%'));
    root.style.setProperty('--ring', safeHSL(tokens.colorPrimary, defaultPrimary));
    
    // === BACKGROUNDS - The main ones that need to change ===
    const bgMain = safeHSL(tokens.bgMain, defaultBg);
    const bgCard = safeHSL(tokens.bgCard, tokens.mode === 'dark' ? '240 10% 6%' : '0 0% 100%');
    
    root.style.setProperty('--background', bgMain);
    root.style.setProperty('--card', bgCard);
    root.style.setProperty('--popover', bgCard);
    
    // Gradient backgrounds
    const gradientFrom = safeHSL(tokens.bgGradientFrom, bgMain);
    const gradientMid = safeHSL(tokens.bgGradientMid, bgCard);
    const gradientTo = safeHSL(tokens.bgGradientTo, bgMain);
    root.style.setProperty('--gradient-start', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--gradient-mid', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--gradient-end', safeHSL(tokens.colorAccent, '185 100% 50%'));
    
    // Glass effects - critical for removing "black barriers"
    const glassBg = safeHSL(tokens.glassBg, bgCard);
    const glassBorder = safeHSL(tokens.glassBorder, safeHSL(tokens.borderColor, tokens.mode === 'dark' ? '240 10% 20%' : '240 5% 90%'));
    root.style.setProperty('--glass', glassBg);
    root.style.setProperty('--glass-border', glassBorder);
    
    // Muted backgrounds
    const mutedBg = adjustLightness(bgCard, tokens.mode === 'dark' ? 5 : -5);
    root.style.setProperty('--muted', mutedBg);
    
    // === SIDEBAR ===
    const sidebarBg = safeHSL(tokens.sidebarBg, bgCard);
    root.style.setProperty('--sidebar-background', sidebarBg);
    root.style.setProperty('--sidebar-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--sidebar-primary', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--sidebar-primary-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
    root.style.setProperty('--sidebar-accent', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--sidebar-accent-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--sidebar-border', safeHSL(tokens.borderColor, glassBorder));
    root.style.setProperty('--sidebar-ring', safeHSL(tokens.colorPrimary, defaultPrimary));
    
    // === TEXT COLORS ===
    root.style.setProperty('--foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--muted-foreground', safeHSL(tokens.textSecondary, defaultMuted));
    root.style.setProperty('--card-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--popover-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--primary-foreground', safeHSL(tokens.buttonText, tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%'));
    root.style.setProperty('--secondary-foreground', safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--accent-foreground', tokens.mode === 'dark' ? '0 0% 100%' : '0 0% 0%');
    
    // === BORDERS & INPUTS ===
    const borderColor = safeHSL(tokens.borderColor, tokens.mode === 'dark' ? '240 10% 18%' : '240 5% 85%');
    const inputBg = safeHSL(tokens.inputBg, borderColor);
    const inputText = safeHSL(tokens.inputText, safeHSL(tokens.textPrimary, defaultText));
    root.style.setProperty('--border', borderColor);
    root.style.setProperty('--input', inputBg);
    root.style.setProperty('--input-foreground', inputText);
    
    // === NEON/ACCENT COLORS ===
    root.style.setProperty('--neon-pink', safeHSL(tokens.neonPink, safeHSL(tokens.colorPrimary, defaultPrimary)));
    root.style.setProperty('--neon-purple', safeHSL(tokens.neonPurple, safeHSL(tokens.colorSecondary, '280 100% 60%')));
    root.style.setProperty('--neon-cyan', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));
    
    // === CHART COLORS ===
    root.style.setProperty('--chart-1', safeHSL(tokens.colorPrimary, defaultPrimary));
    root.style.setProperty('--chart-2', safeHSL(tokens.colorSecondary, '240 10% 12%'));
    root.style.setProperty('--chart-3', safeHSL(tokens.colorAccent, '185 100% 50%'));
    root.style.setProperty('--chart-4', safeHSL(tokens.neonPink, safeHSL(tokens.colorPrimary, defaultPrimary)));
    root.style.setProperty('--chart-5', safeHSL(tokens.neonCyan, safeHSL(tokens.colorAccent, '185 100% 50%')));
    
    // === BORDER RADIUS ===
    const validRadius = ['small', 'medium', 'large'].includes(tokens.borderRadius) ? tokens.borderRadius : 'medium';
    root.style.setProperty('--radius', BORDER_RADIUS_MAP[validRadius]);
    
    // === ANIMATION SETTINGS ===
    const animSpeed = tokens.animationSpeed || 'normal';
    const animStyle = tokens.animationStyle || 'smooth';
    
    // Animation duration multiplier
    const speedMap = { slow: '1.5', normal: '1', fast: '0.6', instant: '0.1' };
    root.style.setProperty('--anim-speed', speedMap[animSpeed] || '1');
    
    // Animation easing
    const easingMap = {
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      snappy: 'cubic-bezier(0.22, 1, 0.36, 1)',
      none: 'linear',
    };
    root.style.setProperty('--anim-easing', easingMap[animStyle] || easingMap.smooth);
    
    // Set CSS classes for animation styles
    root.dataset.animSpeed = animSpeed;
    root.dataset.animStyle = animStyle;
    
    // === BACKGROUND IMAGE & EFFECTS ===
    root.dataset.bgEffect = tokens.backgroundEffect || 'none';
    
    // Set background image as CSS variable for use in CSS
    // CRITICAL: Set on <html> element so #root::before can use it
    if (tokens.backgroundImage) {
      root.style.setProperty('--bg-image-url', `url(${tokens.backgroundImage})`);
      root.style.setProperty('--bg-image-opacity', String((tokens.backgroundOpacity ?? 50) / 100));
      root.style.setProperty('--bg-image-blur', `${tokens.backgroundBlur ?? 0}px`);
      root.setAttribute('data-has-bg-image', 'true');
    } else {
      root.style.removeProperty('--bg-image-url');
      root.style.removeProperty('--bg-image-opacity');
      root.style.removeProperty('--bg-image-blur');
      root.setAttribute('data-has-bg-image', 'false');
    }
    
    if (tokens.backgroundOverlay) {
      root.style.setProperty('--bg-overlay', safeHSL(tokens.backgroundOverlay, '0 0% 0%'));
    } else {
      root.style.removeProperty('--bg-overlay');
    }
    
    // === LIGHT MODE SPECIFIC ===
    if (tokens.mode === 'light') {
      root.style.setProperty('--light-bg-start', gradientFrom);
      root.style.setProperty('--light-bg-mid', gradientMid);
    }
    
    // === MODE CLASS ===
    root.classList.remove('light', 'dark');
    root.classList.add(tokens.mode === 'light' ? 'light' : 'dark');
  } catch (error) {
    console.error('Error applying theme tokens:', error);
  }
}

export function useApplyUserTheme() {
  const { data: userTheme } = useUserTheme();

  useEffect(() => {
    try {
      // First check for equipped community theme from localStorage
      const equippedThemeTokens = localStorage.getItem('vybe-custom-theme');
      if (equippedThemeTokens) {
        const tokens = JSON.parse(equippedThemeTokens) as ThemeTokens;
        if (tokens && typeof tokens === 'object' && tokens.colorPrimary) {
          applyThemeTokens(tokens);
          return; // Use equipped theme, don't override with user theme
        }
      }

      // Fall back to user's saved theme from database
      if (userTheme?.is_active && userTheme.theme_tokens) {
        const tokens = userTheme.theme_tokens as unknown as ThemeTokens;
        if (tokens && typeof tokens === 'object' && tokens.colorPrimary) {
          applyThemeTokens(tokens);
        }
      }
    } catch (error) {
      console.error('Error applying user theme:', error);
    }
  }, [userTheme]);
}

// Hook to load and apply active background on app start
export function useApplyActiveBackground() {
  useEffect(() => {
    const loadActiveBackground = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get profile id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        
        if (!profile) return;

        // Get active background
        const { data: activeBg } = await supabase
          .from('user_backgrounds')
          .select('image_url')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle();

        if (activeBg?.image_url) {
          const root = document.documentElement;
          root.style.setProperty('--bg-image-url', `url(${activeBg.image_url})`);
          root.style.setProperty('--bg-image-opacity', '0.5'); // Default opacity
          root.style.setProperty('--bg-image-blur', '0px'); // Default no blur
          root.setAttribute('data-has-bg-image', 'true');
        }
      } catch (error) {
        console.error('Failed to load active background:', error);
      }
    };

    loadActiveBackground();
  }, []);
}
