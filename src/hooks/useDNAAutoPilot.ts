import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type AutoPilotMode = 'off' | 'suggest' | 'autonomous';
export type AutoPilotIntensity = 'gentle' | 'balanced' | 'bold';

export interface AutoPilotSettings {
  user_id: string;
  mode: AutoPilotMode;
  cadence_minutes: number;
  last_run_at: string | null;
  trigger_on_post: boolean;
  trigger_on_follow: boolean;
  trigger_on_session: boolean;
  max_intensity: AutoPilotIntensity;
  learning_paused: boolean;
  personalization_opted_out: boolean;
}

export interface AutoPilotAction {
  id: string;
  user_id: string;
  action_type: 'feed_tune' | 'theme_swap' | 'layout_change' | 'suggest_user' | 'nudge';
  summary: string;
  before: any;
  after: any;
  applied: boolean;
  reverted: boolean;
  created_at: string;
}

const DNA_ACTIONS_CACHE_KEY = 'vybe-dna-actions-cache';

function readCachedActions(userId: string): AutoPilotAction[] {
  try {
    const raw = localStorage.getItem(`${DNA_ACTIONS_CACHE_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCachedActions(userId: string, actions: AutoPilotAction[]) {
  try {
    localStorage.setItem(`${DNA_ACTIONS_CACHE_KEY}:${userId}`, JSON.stringify(actions.slice(0, 30)));
  } catch { /* noop */ }
}

function buildDefaultSettings(userId: string): AutoPilotSettings {
  return {
    user_id: userId,
    mode: 'suggest',
    cadence_minutes: 360,
    last_run_at: null,
    trigger_on_post: true,
    trigger_on_follow: true,
    trigger_on_session: true,
    max_intensity: 'balanced',
    learning_paused: false,
    personalization_opted_out: false,
  };
}

export function useDNAAutoPilot() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AutoPilotSettings | null>(() =>
    user?.id ? buildDefaultSettings(user.id) : null,
  );
  const [actions, setActions] = useState<AutoPilotAction[]>(() =>
    user?.id ? readCachedActions(user.id) : [],
  );
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;

    const cachedSettings = queryClient.getQueryData<AutoPilotSettings>(['dna-agent-settings', user.id]);
    if (cachedSettings) {
      setSettings({ ...buildDefaultSettings(user.id), ...cachedSettings });
      setLoading(false);
    }

    const cachedActions = readCachedActions(user.id);
    if (cachedActions.length > 0) {
      setActions(cachedActions);
      setLoading(false);
    }

    const [s, a] = await Promise.all([
      supabase.from('dna_agent_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('dna_agent_actions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ]);
    const mergedSettings = { ...buildDefaultSettings(user.id), ...((s.data as any) || {}) };
    const nextActions = ((a.data as any[]) || []) as AutoPilotAction[];
    setSettings(mergedSettings);
    setActions(nextActions);
    queryClient.setQueryData(['dna-agent-settings', user.id], mergedSettings);
    writeCachedActions(user.id, nextActions);
    setLoading(false);
  }, [user?.id, queryClient]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<AutoPilotSettings>) => {
    if (!user?.id) return;
    const prev = settings;
    // Optimistic update for instant UI feedback
    setSettings(p => p ? { ...p, ...patch } : { ...(patch as any), user_id: user.id });
    const merged = { ...(settings || {} as any), ...patch, user_id: user.id };
    const { last_run_at, created_at, updated_at, ...payload } = merged as any;
    const { error } = await supabase
      .from('dna_agent_settings')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.error('[AutoPilot] setting save failed', error);
      setSettings(prev); // rollback
      toast.error('Could not save Auto-Pilot setting. Try again.');
    }
  }, [user?.id, settings]);

  const setMode = useCallback(async (mode: AutoPilotMode) => {
    await updateSettings({ mode });
  }, [updateSettings]);

  const clearAdaptationData = useCallback(async () => {
    const { error } = await supabase.rpc('clear_dna_adaptation_data');
    if (error) { toast.error('Could not clear data'); return; }
    toast.success('All adaptation data cleared');
    await refresh();
  }, [refresh]);

  const runNow = useCallback(async () => {
    if (!user?.id || running) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('dna-autopilot', { body: { trigger: 'manual' } });
      if (error) {
        // Friendly handling for AI gateway rate limit / credit errors
        const ctx: any = (error as any).context;
        const status = ctx?.status ?? (error as any).status;
        const msg = String((error as any).message || '');
        if (status === 429 || /rate limit/i.test(msg)) {
          toast('Auto-Pilot is busy right now — try again in a minute.');
          return;
        }
        if (status === 402 || /credit/i.test(msg)) {
          toast.error('AI credits exhausted. Add credits to keep Auto-Pilot running.');
          return;
        }
        throw error;
      }
      // Soft-fail signals from the edge function (200 OK + flag)
      if (data?.rateLimited) {
        toast(data.message || 'Auto-Pilot is busy right now — try again in a minute.');
        return;
      }
      if (data?.creditsExhausted) {
        toast.error(data.message || 'AI credits exhausted.');
        return;
      }
      const acts = (data?.actions || []) as AutoPilotAction[];
      const mode = (data?.mode || settings?.mode || 'suggest') as AutoPilotMode;
      if (acts.length === 0) {
        toast('Auto-Pilot found nothing new to tune yet — keep using VYBE.');
      } else if (mode === 'autonomous') {
        // Show each summary so user sees exactly what happened
        acts.slice(0, 3).forEach(a => toast.success(a.summary));
        // Surface nudge messages directly
        acts.filter(a => a.action_type === 'nudge').forEach(a => {
          const msg = (a.after as any)?.message;
          if (msg) toast(msg, { duration: 6000 });
        });
      } else {
        toast.success(`Auto-Pilot drafted ${acts.length} change${acts.length === 1 ? '' : 's'} — review & apply below`);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Auto-Pilot run failed');
    } finally {
      setRunning(false);
    }
  }, [user?.id, running, refresh]);

  const revert = useCallback(async (actionId: string) => {
    const { error } = await supabase.functions.invoke('dna-autopilot-revert', { body: { actionId } });
    if (error) { toast.error('Revert failed'); return; }
    toast.success('Reverted');
    await refresh();
  }, [refresh]);

  const applyPending = useCallback(async (actionId: string) => {
    const { error } = await supabase.functions.invoke('dna-autopilot-revert', { body: { actionId, applyPending: true } });
    if (error) { toast.error('Apply failed'); return; }
    toast.success('Applied');
    await refresh();
  }, [refresh]);

  return { settings, actions, loading, running, setMode, updateSettings, clearAdaptationData, runNow, revert, applyPending, refresh };
}
