import { useCallback, useMemo } from 'react';
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';
import { ALL_WIDGETS, type WidgetDef } from './useHomeLayout';

export interface GridWidgetState extends WidgetDef {
  enabled: boolean;
  colSpan: 1 | 2; // 1 = half width, 2 = full width
  rowSpan: 1 | 2; // 1 = normal, 2 = tall
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

const DEFAULT_GRID: GridWidgetState[] = ALL_WIDGETS.map((w, i) => ({
  ...w,
  enabled: i < 4,
  colSpan: w.id === 'ai_brief' || w.id === 'stories' ? 2 : 1,
  rowSpan: 1,
  order: i,
}));

export function useGridLayout() {
  const { data: prefs } = useUserPreferences();
  const update = useUpdatePreferences();

  const config = useMemo((): GridLayoutConfig => {
    const saved = (prefs?.extra as any)?.grid_layout as Partial<GridLayoutConfig> | undefined;
    
    const savedWidgets = saved?.widgets;
    const widgets: GridWidgetState[] = ALL_WIDGETS.map((def, i) => {
      const sw = savedWidgets?.find((w: any) => w.id === def.id);
      if (sw) return { ...def, ...sw };
      return { ...def, enabled: i < 4, colSpan: def.id === 'ai_brief' || def.id === 'stories' ? 2 as const : 1 as const, rowSpan: 1 as const, order: i };
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
  }, [prefs?.extra]);

  const saveGridLayout = useCallback(async (newConfig: Partial<GridLayoutConfig>) => {
    const currentExtra = (prefs?.extra as any) ?? {};
    const current = currentExtra.grid_layout ?? {};
    await update.mutateAsync({
      extra: {
        ...currentExtra,
        grid_layout: { ...current, ...newConfig },
        // Also sync to legacy home_layout for backwards compat
        home_layout: {
          order: (newConfig.widgets ?? config.widgets).filter(w => w.enabled).map(w => w.id),
          hidden: (newConfig.widgets ?? config.widgets).filter(w => !w.enabled).map(w => w.id),
        },
      },
    });
  }, [prefs?.extra, update, config.widgets]);

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
    saveGridLayout,
    toggleWidget,
    resizeWidget,
    reorderWidgets,
  };
}
