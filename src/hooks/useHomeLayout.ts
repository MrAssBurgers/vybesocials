import { useCallback, useMemo } from 'react';
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';

export interface WidgetDef {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface WidgetState extends WidgetDef {
  enabled: boolean;
}

export const ALL_WIDGETS: WidgetDef[] = [
  { id: 'greeting',       label: 'Greeting',       icon: '👋', description: 'Good morning / evening message' },
  { id: 'stories',        label: 'Stories',         icon: '📸', description: 'Stories from people you follow' },
  { id: 'xp_streak',      label: 'XP & Streak',    icon: '🔥', description: 'Level progress and daily streak' },
  { id: 'ai_brief',       label: 'Daily Brief',    icon: '⚡', description: 'Your personalized AI catch-up' },
  { id: 'weekly_rhythm',  label: 'Weekly Vibes',   icon: '📊', description: 'Top XP earners and activity' },
  { id: 'discovery',      label: 'Quick Access',   icon: '🧭', description: 'Wallet, Shop, DNA, Communities' },
  { id: 'feed',           label: 'Feed',           icon: '📰', description: 'Posts from your community' },
  { id: 'trending',       label: 'Trending Tags',  icon: '🏷️', description: "What's blowing up on VYBE" },
  { id: 'online_friends', label: 'Online Now',     icon: '👥', description: 'Friends currently online (mobile)' },
];

const DEFAULT_ORDER = ['ai_brief', 'xp_streak', 'stories', 'weekly_rhythm'];
const DEFAULT_HIDDEN: string[] = [];

export interface HomeLayout {
  order: string[];
  hidden: string[];
}

export function useHomeLayout() {
  const { data: prefs } = useUserPreferences();
  const update = useUpdatePreferences();

  const layout = useMemo((): HomeLayout => ({
    order: ((prefs?.extra as any)?.home_layout?.order ?? DEFAULT_ORDER) as string[],
    hidden: ((prefs?.extra as any)?.home_layout?.hidden ?? DEFAULT_HIDDEN) as string[],
  }), [prefs?.extra]);

  const widgets = useMemo((): WidgetState[] => {
    const orderedIds = [...layout.order];
    // Append any new widgets not yet in user's saved order
    ALL_WIDGETS.forEach(w => {
      if (!orderedIds.includes(w.id)) orderedIds.push(w.id);
    });
    return orderedIds
      .map(id => {
        const def = ALL_WIDGETS.find(w => w.id === id);
        if (!def) return null;
        return { ...def, enabled: !layout.hidden.includes(id) };
      })
      .filter(Boolean) as WidgetState[];
  }, [layout]);

  const saveLayout = useCallback(async (order: string[], hidden: string[]) => {
    const currentExtra = (prefs?.extra as any) ?? {};
    await update.mutateAsync({
      extra: { ...currentExtra, home_layout: { order, hidden } },
    });
  }, [prefs?.extra, update]);

  const toggleWidget = useCallback(async (id: string) => {
    const newHidden = layout.hidden.includes(id)
      ? layout.hidden.filter(h => h !== id)
      : [...layout.hidden, id];
    await saveLayout(layout.order, newHidden);
  }, [layout, saveLayout]);

  const reorderWidgets = useCallback(async (newOrder: string[]) => {
    await saveLayout(newOrder, layout.hidden);
  }, [layout.hidden, saveLayout]);

  const applyLayout = useCallback(async (order: string[], hidden: string[]) => {
    await saveLayout(order, hidden);
  }, [saveLayout]);

  const isVisible = useCallback((id: string) => !layout.hidden.includes(id), [layout.hidden]);

  return { widgets, layout, toggleWidget, reorderWidgets, applyLayout, isVisible };
}
