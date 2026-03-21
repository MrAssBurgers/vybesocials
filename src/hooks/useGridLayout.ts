import { useCallback, useMemo } from 'react';
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';
import { ALL_WIDGETS, type WidgetDef } from './useHomeLayout';
import { useIsMobileOrTablet } from './use-mobile';

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

const DEFAULT_WIDGETS = (variant: LayoutVariant): GridWidgetState[] =>
  ALL_WIDGETS.map((w, i) => ({
    ...w,
    enabled: i < 4,
    colSpan: (w.id === 'ai_brief' || w.id === 'stories') ? 2 as const : 1 as const,
    rowSpan: 1 as const,
    order: i,
  }));

function parseConfig(saved: Partial<GridLayoutConfig> | undefined): GridLayoutConfig {
  const savedWidgets = saved?.widgets;
  const DEFAULT_ENABLED = new Set(['greeting', 'xp_streak', 'ai_brief', 'stories', 'weekly_rhythm', 'discovery', 'feed']);

  const widgets: GridWidgetState[] = ALL_WIDGETS.map((def, i) => {
    const sw = savedWidgets?.find((w: any) => w.id === def.id);
    if (sw) return { ...def, ...sw };
    return {
      ...def,
      enabled: DEFAULT_ENABLED.has(def.id),
      colSpan: (def.id === 'feed' || def.id === 'stories') ? 2 as const : 1 as const,
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

  const variant: LayoutVariant = isMobileOrTablet ? 'mobile' : 'desktop';

  const config = useMemo((): GridLayoutConfig => {
    const gridRoot = (prefs?.extra as any)?.grid_layout;
    // Try variant-specific first, fall back to legacy root
    const saved = gridRoot?.[variant] ?? gridRoot;
    return parseConfig(saved as Partial<GridLayoutConfig> | undefined);
  }, [prefs?.extra, variant]);

  const saveGridLayout = useCallback(async (newConfig: Partial<GridLayoutConfig>) => {
    const currentExtra = (prefs?.extra as any) ?? {};
    const currentGrid = currentExtra.grid_layout ?? {};
    const currentVariant = currentGrid[variant] ?? currentGrid;
    const merged = { ...currentVariant, ...newConfig };

    await update.mutateAsync({
      extra: {
        ...currentExtra,
        grid_layout: {
          ...currentGrid,
          [variant]: merged,
        },
        // Sync legacy home_layout for backwards compat
        home_layout: {
          order: (newConfig.widgets ?? config.widgets).filter(w => w.enabled).map(w => w.id),
          hidden: (newConfig.widgets ?? config.widgets).filter(w => !w.enabled).map(w => w.id),
        },
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
