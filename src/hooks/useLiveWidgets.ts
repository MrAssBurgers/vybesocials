import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type WidgetType = 
  | 'clock' 
  | 'weather' 
  | 'music_player' 
  | 'streak_counter' 
  | 'token_balance' 
  | 'mood_ring' 
  | 'friend_activity' 
  | 'quick_post'
  | 'trending_tags'
  | 'countdown';

export type WidgetSize = 'small' | 'medium' | 'large';

export interface LiveWidget {
  id: string;
  user_id: string;
  widget_type: WidgetType;
  config: Record<string, unknown>;
  position: { x: number; y: number; zone?: 'top' | 'middle' | 'bottom' };
  size: WidgetSize;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

// Widget definitions
export const WIDGET_CATALOG: Record<WidgetType, {
  label: string;
  icon: string;
  description: string;
  defaultSize: WidgetSize;
  refreshInterval?: number;
}> = {
  clock: { label: 'Clock', icon: '🕐', description: 'Current time with style', defaultSize: 'small' },
  weather: { label: 'Weather', icon: '🌤️', description: 'Local weather conditions', defaultSize: 'medium', refreshInterval: 600_000 },
  music_player: { label: 'Now Playing', icon: '🎵', description: 'Mini music player', defaultSize: 'medium' },
  streak_counter: { label: 'Streak', icon: '🔥', description: 'Your current streak', defaultSize: 'small' },
  token_balance: { label: 'VYBE Tokens', icon: '💎', description: 'Token balance', defaultSize: 'small' },
  mood_ring: { label: 'Mood Ring', icon: '💫', description: 'Current mood visualization', defaultSize: 'small' },
  friend_activity: { label: 'Friends', icon: '👥', description: 'Recent friend activity', defaultSize: 'large', refreshInterval: 30_000 },
  quick_post: { label: 'Quick Post', icon: '✏️', description: 'One-tap posting', defaultSize: 'medium' },
  trending_tags: { label: 'Trending', icon: '📈', description: 'Hot tags right now', defaultSize: 'medium', refreshInterval: 60_000 },
  countdown: { label: 'Countdown', icon: '⏳', description: 'Count down to an event', defaultSize: 'small' },
};

export function useLiveWidgets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['live-widgets', user?.id],
    queryFn: async (): Promise<LiveWidget[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('live_widgets' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as LiveWidget[];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useAddWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (widget: Omit<LiveWidget, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const catalog = WIDGET_CATALOG[widget.widget_type];
      
      const { data, error } = await supabase
        .from('live_widgets' as any)
        .insert({
          user_id: user.id,
          widget_type: widget.widget_type,
          config: widget.config || {},
          position: widget.position || { x: 0, y: 0 },
          size: widget.size || catalog?.defaultSize || 'medium',
          is_visible: widget.is_visible ?? true,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as LiveWidget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-widgets', user?.id] });
    },
  });
}

export function useUpdateWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LiveWidget> & { id: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('live_widgets' as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as LiveWidget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-widgets', user?.id] });
    },
  });
}

export function useRemoveWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (widgetId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('live_widgets' as any)
        .delete()
        .eq('id', widgetId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-widgets', user?.id] });
    },
  });
}

export function useToggleWidget() {
  const update = useUpdateWidget();

  return (id: string, isVisible: boolean) => {
    update.mutate({ id, is_visible: isVisible });
  };
}
