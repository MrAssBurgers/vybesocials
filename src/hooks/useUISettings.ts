import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useEffect, useCallback } from 'react';
import { readDevicePreference, writeDevicePreference } from '@/lib/devicePreferences';

// Default navigation tabs
export const DEFAULT_NAV_TABS = ['home', 'explore', 'upload', 'messages', 'profile'] as const;
export type NavTab = typeof DEFAULT_NAV_TABS[number];

// Layout module types per page
export interface LayoutModule {
  id: string;
  name: string;
  visible: boolean;
  order: number;
}

export interface PageLayout {
  home: LayoutModule[];
  messages: LayoutModule[];
  profile: LayoutModule[];
  explore: LayoutModule[];
}

// Default layouts
export const DEFAULT_LAYOUTS: PageLayout = {
  home: [
    { id: 'stories', name: 'Stories', visible: true, order: 0 },
    { id: 'for-you', name: 'For You Feed', visible: true, order: 1 },
    { id: 'following', name: 'Following Feed', visible: true, order: 2 },
    { id: 'trending', name: 'Trending', visible: true, order: 3 },
  ],
  messages: [
    { id: 'online-friends', name: 'Online Friends', visible: true, order: 0 },
    { id: 'chats', name: 'Chats', visible: true, order: 1 },
    { id: 'requests', name: 'Requests', visible: true, order: 2 },
  ],
  profile: [
    { id: 'posts', name: 'Posts', visible: true, order: 0 },
    { id: 'about', name: 'About', visible: true, order: 1 },
    { id: 'friends', name: 'Friends', visible: true, order: 2 },
    { id: 'mutuals', name: 'Mutuals', visible: true, order: 3 },
  ],
  explore: [
    { id: 'search', name: 'Search', visible: true, order: 0 },
    { id: 'clips', name: 'Clips', visible: true, order: 1 },
    { id: 'trending', name: 'Trending', visible: true, order: 2 },
    { id: 'discover', name: 'Discover', visible: true, order: 3 },
  ],
};

export interface UISettings {
  // Navigation
  navTabs: NavTab[];
  navOrder: number[];
  
  // Layouts
  layouts: PageLayout;
  
  // Theme customization extras
  fontScale: 'small' | 'medium' | 'large' | 'xlarge';
  contrastLevel: 'low' | 'medium' | 'high';
  buttonStyle: 'glass' | 'solid' | 'outline';
  motionIntensity: 'low' | 'medium' | 'high';
  
  // Safe mode
  safeMode: boolean;
  
  // Version
  configVersion: number;
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  navTabs: [...DEFAULT_NAV_TABS],
  navOrder: [0, 1, 2, 3, 4],
  layouts: DEFAULT_LAYOUTS,
  fontScale: 'medium',
  contrastLevel: 'medium',
  buttonStyle: 'glass',
  motionIntensity: 'medium',
  safeMode: false,
  configVersion: 1,
};

// Device cache is scoped to the signed-in account. Legacy unowned cache is never reused.
const UI_SETTINGS_CACHE_KEY = 'vybe-ui-settings-cache';

export function getCachedSettings(userId?: string): UISettings | null {
  if (!userId) return null;
  try {
    const cached = readDevicePreference(`${UI_SETTINGS_CACHE_KEY}:${encodeURIComponent(userId)}`);
    if (cached) return validateSettings(JSON.parse(cached));
  } catch { /* Ignore malformed or unavailable cache. */ }
  return null;
}

export function cacheSettings(userId: string, settings: UISettings) {
  writeDevicePreference(`${UI_SETTINGS_CACHE_KEY}:${encodeURIComponent(userId)}`, JSON.stringify(validateSettings(settings)));
}

export function clearSettingsCache(userId: string) {
  writeDevicePreference(`${UI_SETTINGS_CACHE_KEY}:${encodeURIComponent(userId)}`, null);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

// Remote and offline settings are untrusted; every returned layout is complete and independent.
export function validateSettings(value: unknown): UISettings {
  const settings = record(value);
  const layouts = record(settings.layouts);
  const validated: UISettings = {
    ...DEFAULT_UI_SETTINGS,
    navTabs: [...DEFAULT_NAV_TABS],
    navOrder: [...DEFAULT_UI_SETTINGS.navOrder],
    layouts: {
      home: validateLayoutModules(layouts.home, DEFAULT_LAYOUTS.home),
      messages: validateLayoutModules(layouts.messages, DEFAULT_LAYOUTS.messages),
      profile: validateLayoutModules(layouts.profile, DEFAULT_LAYOUTS.profile),
      explore: validateLayoutModules(layouts.explore, DEFAULT_LAYOUTS.explore),
    },
  };

  if (Array.isArray(settings.navTabs)) {
    const tabs = [...new Set(settings.navTabs.filter((tab): tab is NavTab => DEFAULT_NAV_TABS.includes(tab as NavTab)))];
    if (!tabs.includes('home')) tabs.unshift('home');
    if (tabs.length >= 3) validated.navTabs = tabs;
  }
  const indexes = validated.navTabs.map((_, index) => index);
  const storedOrder = Array.isArray(settings.navOrder)
    ? [...new Set(settings.navOrder.filter((index): index is number => Number.isInteger(index) && indexes.includes(index as number)))] : [];
  validated.navOrder = [...storedOrder, ...indexes.filter(index => !storedOrder.includes(index))];

  if (['small', 'medium', 'large', 'xlarge'].includes(settings.fontScale as string)) validated.fontScale = settings.fontScale as UISettings['fontScale'];
  if (['low', 'medium', 'high'].includes(settings.contrastLevel as string)) validated.contrastLevel = settings.contrastLevel as UISettings['contrastLevel'];
  if (['glass', 'solid', 'outline'].includes(settings.buttonStyle as string)) validated.buttonStyle = settings.buttonStyle as UISettings['buttonStyle'];
  if (['low', 'medium', 'high'].includes(settings.motionIntensity as string)) validated.motionIntensity = settings.motionIntensity as UISettings['motionIntensity'];
  if (typeof settings.safeMode === 'boolean') validated.safeMode = settings.safeMode;
  if (Number.isSafeInteger(settings.configVersion) && (settings.configVersion as number) > 0) validated.configVersion = settings.configVersion as number;
  return validated;
}

function validateLayoutModules(value: unknown, defaults: LayoutModule[]): LayoutModule[] {
  const candidates = Array.isArray(value) ? value.map(record) : [];
  return defaults.map((fallback) => {
    const saved = candidates.find(candidate => candidate.id === fallback.id);
    return {
      ...fallback,
      visible: typeof saved?.visible === 'boolean' ? saved.visible : fallback.visible,
      order: Number.isSafeInteger(saved?.order) && (saved?.order as number) >= 0 ? saved!.order as number : fallback.order,
    };
  }).sort((a, b) => a.order - b.order).map((module, order) => ({ ...module, order }));
}

// Fetch user UI settings
export function useUISettings() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['ui-settings', userId],
    queryFn: async (): Promise<UISettings> => {
      // Try cache first for instant load
      const cached = getCachedSettings(userId);
      
      if (!userId) {
        return cached || DEFAULT_UI_SETTINGS;
      }

      const { data, error } = await db
        .from('user_ui_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch UI settings:', error);
        return cached || DEFAULT_UI_SETTINGS;
      }

      if (!data) {
        return cached || DEFAULT_UI_SETTINGS;
      }

      // Parse and validate settings
      const uiConfig = (data.ui_config as Record<string, unknown>) || {};
      const settings = validateSettings({
        navTabs: uiConfig.navTabs as NavTab[],
        navOrder: uiConfig.navOrder as number[],
        layouts: uiConfig.layouts as PageLayout,
        fontScale: uiConfig.fontScale as UISettings['fontScale'],
        contrastLevel: uiConfig.contrastLevel as UISettings['contrastLevel'],
        buttonStyle: uiConfig.buttonStyle as UISettings['buttonStyle'],
        motionIntensity: uiConfig.motionIntensity as UISettings['motionIntensity'],
        safeMode: data.safe_mode ?? false,
        configVersion: data.config_version ?? 1,
      });

      // Cache for offline/instant access
      cacheSettings(userId, settings);

      return settings;
    },
    staleTime: 60000,
    initialData: () => getCachedSettings(userId) || undefined,
    initialDataUpdatedAt: 0,
  });
}

// Save UI settings
export function useSaveUISettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<UISettings>) => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Get current settings and merge
      const current = queryClient.getQueryData<UISettings>(['ui-settings', userId]) || getCachedSettings(userId) || DEFAULT_UI_SETTINGS;
      const merged = validateSettings({ ...current, ...settings });

      const { error } = await db
        .from('user_ui_settings')
        .upsert([{
          user_id: userId,
          ui_config: merged as any,
          nav_settings: {
            tabs: merged.navTabs,
            order: merged.navOrder,
          } as any,
          layout_settings: merged.layouts as any,
          safe_mode: merged.safeMode,
          config_version: merged.configVersion,
          updated_at: new Date().toISOString(),
        }], { onConflict: 'user_id' });

      if (error) throw error;

      // Update cache
      cacheSettings(userId, merged);

      return merged;
    },
    onMutate: () => ({ userId: user?.id }),
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData(['ui-settings', context?.userId], data);
    },
    onError: (error: any) => {
      console.error('Failed to save UI settings:', error);
      toast.error('Failed to save settings');
    },
  });
}

// Reset UI settings to default
export function useResetUISettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await db
        .from('user_ui_settings')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      // Clear cache
      clearSettingsCache(userId);

      return DEFAULT_UI_SETTINGS;
    },
    onMutate: () => ({ userId: user?.id }),
    onSuccess: (_data, _variables, context) => {
      queryClient.setQueryData(['ui-settings', context?.userId], validateSettings(null));
      queryClient.invalidateQueries({ queryKey: ['ui-settings', context?.userId] });
      toast.success('Settings reset to default');
    },
    onError: (error: any) => {
      console.error('Failed to reset UI settings:', error);
      toast.error('Failed to reset settings');
    },
  });
}

// Hook to apply UI settings to document
export function useApplyUISettings() {
  const { data: settings } = useUISettings();

  useEffect(() => {
    if (!settings) return;

    const root = document.documentElement;

    // Apply font scale
    const fontScaleMap = { small: '14px', medium: '16px', large: '18px', xlarge: '20px' };
    root.style.setProperty('--font-base', fontScaleMap[settings.fontScale]);

    // Apply contrast level
    root.dataset.contrast = settings.contrastLevel;

    // Apply button style
    root.dataset.buttonStyle = settings.buttonStyle;

    // Apply motion intensity
    const motionMap = { low: '0.5', medium: '1', high: '1.5' };
    root.style.setProperty('--motion-intensity', motionMap[settings.motionIntensity]);

  }, [settings]);

  return settings;
}

// Export/Import theme code functions
export function useExportThemeCode() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (themeId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Generate a unique code
      const { data: codeData, error: codeError } = await db
        .rpc('generate_theme_code');

      if (codeError) throw codeError;

      const code = codeData as string;

      // Insert the theme code
      const { error } = await db
        .from('theme_codes')
        .insert({
          code,
          theme_id: themeId,
          creator_id: profile.id,
        });

      if (error) throw error;

      return code;
    },
    onSuccess: (code) => {
      toast.success(`Theme code created: ${code}`);
    },
    onError: (error: any) => {
      console.error('Failed to create theme code:', error);
      toast.error('Failed to create theme code');
    },
  });
}

export function useImportThemeCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      // Use the code and get theme ID
      const { data: themeId, error } = await db
        .rpc('use_theme_code', { p_code: code.toUpperCase() });

      if (error) throw error;
      if (!themeId) throw new Error('Invalid or expired theme code');

      // Get the theme data
      const { data: theme, error: themeError } = await db
        .from('shared_themes')
        .select('*')
        .eq('id', themeId)
        .single();

      if (themeError) throw themeError;

      return theme;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      toast.success('Theme imported successfully!');
    },
    onError: (error: any) => {
      console.error('Failed to import theme:', error);
      toast.error(error.message || 'Invalid theme code');
    },
  });
}
