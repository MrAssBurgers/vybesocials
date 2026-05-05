import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface WidgetDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Default colSpan for this widget */
  defaultCol?: 1 | 2;
}

export interface WidgetState extends WidgetDef {
  enabled: boolean;
}

export const ALL_WIDGETS: WidgetDef[] = [
  { id: 'greeting',       label: 'Greeting',       icon: '👋', description: 'Good morning / evening message', defaultCol: 2 },
  { id: 'stories',        label: 'Stories',         icon: '📸', description: 'Stories from people you follow', defaultCol: 2 },
  { id: 'xp_streak',      label: 'XP & Streak',    icon: '🔥', description: 'Level progress and daily streak', defaultCol: 2 },
  { id: 'ai_brief',       label: 'Daily Brief',    icon: '⚡', description: 'Your personalized AI catch-up', defaultCol: 2 },
  { id: 'vybe_dna',       label: 'VYBE DNA',       icon: '🧬', description: 'Your VYBE DNA profile' },
  { id: 'wallet',         label: 'Wallet',          icon: '💰', description: 'Your VYBE wallet' },
  { id: 'shop',           label: 'Shop',            icon: '🛍️', description: 'Browse the marketplace' },
  { id: 'communities',    label: 'Communities',     icon: '📡', description: 'Join live communities' },
  { id: 'weekly_rhythm',  label: 'Weekly Vibes',   icon: '📊', description: 'Top XP earners and activity', defaultCol: 2 },
  { id: 'creator_analytics', label: 'Creator Analytics', icon: '📈', description: 'Your content performance stats', defaultCol: 2 },
  { id: 'battle_pass',   label: 'VYBE Pass',      icon: '⚔️', description: 'Daily quests and battle pass progress', defaultCol: 2 },
  { id: 'feed',           label: 'Feed',           icon: '📰', description: 'Posts from your community', defaultCol: 2 },
  { id: 'trending',       label: 'Trending Tags',  icon: '🏷️', description: "What's blowing up on VYBE" },
  { id: 'online_friends', label: 'Online Now',     icon: '👥', description: 'Friends currently online (mobile)' },
];

const DEFAULT_ORDER = ['greeting', 'stories', 'xp_streak', 'ai_brief', 'vybe_dna', 'wallet', 'shop', 'communities'];
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
