import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';
import { ALL_WIDGETS, type WidgetDef } from './useHomeLayout';
import { useIsMobileOrTablet } from './use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface GridWidgetState extends WidgetDef {
  enabled: boolean;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
  order: number;
}

export interface GridLayoutConfig {
  widgets: GridWidgetState[];
  background_url: string | null;
  background_opacity: number;
  font_heading: string;
  font_body: string;
  corner_style: 'sharp' | 'rounded' | 'pill';
  motion_intensity: 'none' | 'subtle' | 'normal' | 'extra';
}

export type LayoutVariant = 'mobile' | 'desktop';

const DEFAULT_ENABLED = new Set([
  'greeting', 'stories', 'xp_streak', 'ai_brief',
  'vybe_dna', 'wallet', 'shop', 'communities',
  'weekly_rhythm', 'feed',
]);

function parseConfig(saved: Partial<GridLayoutConfig> | undefined): GridLayoutConfig {
  const savedWidgets = saved?.widgets;

  const widgets: GridWidgetState[] = ALL_WIDGETS.map((def, i) => {
    const sw = savedWidgets?.find((w: any) => w.id === def.id);
    if (sw) return { ...def, ...sw };
    return {
      ...def,
      enabled: DEFAULT_ENABLED.has(def.id),
      colSpan: (def.defaultCol ?? 1) as 1 | 2,
      rowSpan: 1 as const,
      order: i,
    };
  }).sort((a, b) => a.order - b.order);

  return {
    widgets,
    background_url: saved?.background_url ?? null,
    background_opacity: saved?.background_opacity ?? 80,
    font_heading: saved?.font_heading ?? 'system-ui',
    font_body: saved?.font_body ?? 'system-ui',
    corner_style: saved?.corner_style ?? 'rounded',
    motion_intensity: saved?.motion_intensity ?? 'normal',
  };
}

export function useGridLayout() {
  const { data: prefs } = useUserPreferences();
  const update = useUpdatePreferences();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const { user } = useAuth();
  const [autoOverride, setAutoOverride] = useState<{ order?: string[]; hidden?: string[] } | null>(null);

  const variant: LayoutVariant = isMobileOrTablet ? 'mobile' : 'desktop';

  const fetchAutoOverride = useCallback(async () => {
    if (!user?.id) { setAutoOverride(null); return; }
    const { data: settings } = await supabase
      .from('dna_agent_settings').select('mode').eq('user_id', user.id).maybeSingle();
    if (settings?.mode !== 'autonomous') { setAutoOverride(null); return; }
    const { data: action } = await supabase
      .from('dna_agent_actions')
      .select('after')
      .eq('user_id', user.id)
      .eq('action_type', 'layout_change')
      .eq('applied', true)
      .eq('reverted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setAutoOverride((action?.after as any) || null);
  }, [user?.id]);

  useEffect(() => {
    fetchAutoOverride();
    if (!user?.id) return;
    const ch = supabase
      .channel(`autopilot-grid-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dna_agent_actions', filter: `user_id=eq.${user.id}` }, () => fetchAutoOverride())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dna_agent_settings', filter: `user_id=eq.${user.id}` }, () => fetchAutoOverride())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, fetchAutoOverride]);

  const config = useMemo((): GridLayoutConfig => {
    const gridRoot = (prefs?.extra as any)?.grid_layout;
    const saved = gridRoot?.[variant] ?? gridRoot;
    const base = parseConfig(saved as Partial<GridLayoutConfig> | undefined);
    if (!autoOverride) return base;
    const order = autoOverride.order ?? [];
    const hidden = new Set(autoOverride.hidden ?? []);
    const widgets = base.widgets.map((w, i) => {
      const idx = order.indexOf(w.id);
      return {
        ...w,
        enabled: order.length ? (idx !== -1 && !hidden.has(w.id)) : (!hidden.has(w.id) && w.enabled),
        order: idx !== -1 ? idx : (order.length + i),
      };
    }).sort((a, b) => a.order - b.order);
    return { ...base, widgets };
  }, [prefs?.extra, variant, autoOverride]);

  const saveGridLayout = useCallback(async (newConfig: Partial<GridLayoutConfig>, allDevices = false) => {
    const currentExtra = (prefs?.extra as any) ?? {};
    const currentGrid = currentExtra.grid_layout ?? {};
    const currentVariant = currentGrid[variant] ?? currentGrid;
    const merged = { ...currentVariant, ...newConfig };

    const homeLayout = {
      order: (newConfig.widgets ?? config.widgets).filter(w => w.enabled).map(w => w.id),
      hidden: (newConfig.widgets ?? config.widgets).filter(w => !w.enabled).map(w => w.id),
    };

    const gridLayout = allDevices
      ? { ...currentGrid, mobile: merged, desktop: merged }
      : { ...currentGrid, [variant]: merged };

    await update.mutateAsync({
      extra: {
        ...currentExtra,
        grid_layout: gridLayout,
        home_layout: homeLayout,
      },
    });
  }, [prefs?.extra, update, config.widgets, variant]);

  const toggleWidget = useCallback(async (id: string) => {
    const updated = config.widgets.map(w =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    await saveGridLayout({ widgets: updated });
  }, [config.widgets, saveGridLayout]);

  const resizeWidget = useCallback(async (id: string, colSpan: 1 | 2, rowSpan: 1 | 2) => {
    const updated = config.widgets.map(w =>
      w.id === id ? { ...w, colSpan, rowSpan } : w
    );
    await saveGridLayout({ widgets: updated });
  }, [config.widgets, saveGridLayout]);

  const reorderWidgets = useCallback(async (newOrder: string[]) => {
    const updated = config.widgets.map(w => ({
      ...w,
      order: newOrder.indexOf(w.id),
    })).sort((a, b) => a.order - b.order);
    await saveGridLayout({ widgets: updated });
  }, [config.widgets, saveGridLayout]);

  return {
    config,
    variant,
    saveGridLayout,
    toggleWidget,
    resizeWidget,
    reorderWidgets,
  };
}
