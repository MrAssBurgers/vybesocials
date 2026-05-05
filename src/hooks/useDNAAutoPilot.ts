import { useEffect, useState, useCallback } from 'react';
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

export function useDNAAutoPilot() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AutoPilotSettings | null>(null);
  const [actions, setActions] = useState<AutoPilotAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const [s, a] = await Promise.all([
      supabase.from('dna_agent_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('dna_agent_actions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ]);
    const defaults: AutoPilotSettings = {
      user_id: user.id, mode: 'suggest', cadence_minutes: 360, last_run_at: null,
      trigger_on_post: true, trigger_on_follow: true, trigger_on_session: true,
      max_intensity: 'balanced', learning_paused: false, personalization_opted_out: false,
    };
    setSettings({ ...defaults, ...((s.data as any) || {}) });
    setActions((a.data as any[]) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<AutoPilotSettings>) => {
    if (!user?.id) return;
    setSettings(prev => prev ? { ...prev, ...patch } : prev);
    const merged = { ...(settings || {} as any), ...patch, user_id: user.id };
    // strip read-only fields
    const { last_run_at, created_at, updated_at, ...payload } = merged as any;
    await supabase.from('dna_agent_settings').upsert(payload, { onConflict: 'user_id' });
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
      if (error) throw error;
      const count = data?.actions?.length || 0;
      if (count === 0) toast('Auto-Pilot found nothing new to tune yet — keep using VYBE.');
      else toast.success(`Auto-Pilot tuned ${count} thing${count === 1 ? '' : 's'} for you`);
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

  return { settings, actions, loading, running, setMode, runNow, revert, applyPending, refresh };
}
