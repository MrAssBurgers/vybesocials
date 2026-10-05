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

// Social-first default: greeting, stories, feed. Other widgets are opt-in via
// the Customize flow; saved layouts in user prefs are untouched.
const DEFAULT_ENABLED = new Set(['greeting', 'stories', 'feed']);

export function parseGridConfig(saved: Partial<GridLayoutConfig> | undefined, legacy?: { order?: string[]; hidden?: string[] }): GridLayoutConfig {
  const savedWidgets = Array.isArray(saved?.widgets) ? saved.widgets : [];
  const order = Array.isArray(legacy?.order) ? legacy.order : [];
  const hidden = Array.isArray(legacy?.hidden) ? legacy.hidden : [];
  const hasLegacy = Array.isArray(legacy?.order) || Array.isArray(legacy?.hidden);

  const widgets: GridWidgetState[] = ALL_WIDGETS.map((def, i): GridWidgetState => {
    const sw = savedWidgets.find(w => w?.id === def.id);
    return {
      ...def,
      enabled: typeof sw?.enabled === 'boolean' ? sw.enabled : hasLegacy ? order.includes(def.id) && !hidden.includes(def.id) : DEFAULT_ENABLED.has(def.id),
      colSpan: sw?.colSpan === 1 || sw?.colSpan === 2 ? sw.colSpan : def.defaultCol ?? 1,
      rowSpan: sw?.rowSpan === 2 ? 2 : 1,
      order: Number.isFinite(sw?.order) ? sw!.order : order.includes(def.id) ? order.indexOf(def.id) : order.length + i,
    };
  }).sort((a, b) => a.order - b.order);

  return {
    widgets,
    background_url: typeof saved?.background_url === 'string' ? saved.background_url : null,
    background_opacity: Number.isFinite(saved?.background_opacity) ? Math.max(0, Math.min(100, saved!.background_opacity!)) : 80,
    font_heading: typeof saved?.font_heading === 'string' ? saved.font_heading : 'system-ui',
    font_body: typeof saved?.font_body === 'string' ? saved.font_body : 'system-ui',
    corner_style: saved?.corner_style === 'sharp' || saved?.corner_style === 'pill' ? saved.corner_style : 'rounded',
    motion_intensity: saved?.motion_intensity === 'none' || saved?.motion_intensity === 'subtle' || saved?.motion_intensity === 'extra' ? saved.motion_intensity : 'normal',
  };
}

export function useGridLayout() {
  const preferences = useUserPreferences();
  const prefs = preferences.data;
  const update = useUpdatePreferences();
  const { isMobileOrTablet } = useIsMobileOrTablet();

  const variant: LayoutVariant = isMobileOrTablet ? 'mobile' : 'desktop';

  const config = useMemo((): GridLayoutConfig => {
    const gridRoot = (prefs?.extra as any)?.grid_layout;
    const saved = gridRoot?.[variant] ?? gridRoot;
    return parseGridConfig(saved, (prefs?.extra as any)?.home_layout);
  }, [prefs?.extra, variant]);

  const saveGridLayout = useCallback(async (newConfig: Partial<GridLayoutConfig>, allDevices = false) => {
    if (!preferences.isSuccess || preferences.isPlaceholderData || preferences.isError) throw new Error('Your layout is still loading. Try again in a moment.');
    await update.mutateAsync(current => {
      const currentExtra = current.extra as any;
      const currentGrid = currentExtra.grid_layout ?? {};
      const currentVariant = currentGrid[variant] ?? currentGrid;
      const merged = { ...parseGridConfig(currentVariant, currentExtra.home_layout), ...newConfig };

      const homeLayout = {
        order: (newConfig.widgets ?? config.widgets).filter(w => w.enabled).sort((a,b) => a.order-b.order).map(w => w.id),
        hidden: (newConfig.widgets ?? config.widgets).filter(w => !w.enabled).map(w => w.id),
      };

      const gridLayout = allDevices
        ? { mobile: { ...parseGridConfig(currentGrid.mobile ?? currentGrid, currentExtra.home_layout), ...newConfig }, desktop: { ...parseGridConfig(currentGrid.desktop ?? currentGrid, currentExtra.home_layout), ...newConfig } }
        : { ...currentGrid, [variant]: merged };

      return {
        extra: {
          grid_layout: gridLayout,
          home_layout: homeLayout,
        },
      };
    });
  }, [preferences.isSuccess, preferences.isPlaceholderData, preferences.isError, update, config.widgets, variant]);

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
      order: newOrder.includes(w.id) ? newOrder.indexOf(w.id) : newOrder.length + w.order,
    })).sort((a, b) => a.order - b.order);
    await saveGridLayout({ widgets: updated });
  }, [config.widgets, saveGridLayout]);

  return {
    config,
    preferences,
    variant,
    saveGridLayout,
    toggleWidget,
    resizeWidget,
    reorderWidgets,
  };
}
