import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { clearDnaAdaptationData, changeDnaAction } from '@/lib/dnaAdaptationService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

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
  action_type: 'feed_tune' | 'theme_swap' | 'layout_change' | 'suggest_user' | 'nudge' | 'apply_theme' | 'navigate' | 'generate_theme';
  summary: string;
  before: any;
  after: any;
  applied: boolean;
  reverted: boolean;
  created_at: string;
}

const DNA_ACTIONS_CACHE_KEY = 'vybe-dna-actions-cache';

export function normalizeDnaActions(value: unknown, userId: string): AutoPilotAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(row => row && typeof row === 'object' && !Array.isArray(row)
    && typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.id) && row.user_id === userId
    && ['feed_tune', 'theme_swap', 'layout_change', 'suggest_user', 'nudge', 'apply_theme', 'navigate', 'generate_theme'].includes(row.action_type)
    && typeof (row.summary ?? row.reason) === 'string' && (row.summary ?? row.reason).trim().length > 0 && (row.summary ?? row.reason).length <= 500
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)))
    .slice(0, 30).map(row => ({ id: row.id, user_id: userId, action_type: row.action_type, summary: row.summary ?? row.reason,
      // Historical status labels are not proof that the target state changed.
      before: null, after: null, applied: false, reverted: false, created_at: row.created_at }));
}

function readCachedActions(userId: string): AutoPilotAction[] {
  try {
    const raw = localStorage.getItem(`${DNA_ACTIONS_CACHE_KEY}:${userId}`);
    return raw ? normalizeDnaActions(JSON.parse(raw), userId) : [];
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef<object | null>(null);
  const refreshRevision = useRef(0);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const revision = ++refreshRevision.current;
    const guard = tokenAccountGuard(user.id);
    try { guard(); } catch { return; }
    setLoadError(null);
    setLoading(true);

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

    try {
      const [s, a] = await Promise.all([
        db.from('dna_agent_settings').select('*').eq('user_id', user.id).maybeSingle(),
        db.from('dna_agent_actions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      ]);
      guard();
      if (revision !== refreshRevision.current) return;
      if (s.error || a.error) throw s.error || a.error;
      const mergedSettings = { ...buildDefaultSettings(user.id), ...((s.data as any) || {}) };
      const nextActions = normalizeDnaActions(a.data, user.id);
      setSettings(mergedSettings);
      setActions(nextActions);
      queryClient.setQueryData(['dna-agent-settings', user.id], mergedSettings);
      writeCachedActions(user.id, nextActions);
    } catch {
      try { guard(); } catch { return; }
      if (revision !== refreshRevision.current) return;
      setLoadError('Could not load Auto-Pilot. Your saved settings have not been changed.');
    } finally {
      try { guard(); if (revision === refreshRevision.current) setLoading(false); } catch { /* Retired account read. */ }
    }
  }, [user?.id, queryClient]);

  useEffect(() => {
    setSettings(user?.id ? buildDefaultSettings(user.id) : null);
    setActions(user?.id ? readCachedActions(user.id) : []);
    setLoading(!!user?.id);
    setLoadError(null);
    setClearing(false);
    clearingRef.current = null;
    void refresh();
    return () => { refreshRevision.current++; };
  }, [refresh, user?.id]);

  useEffect(() => {
    const onCleared = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== user?.id) return;
      refreshRevision.current++;
      setActions([]);
    };
    window.addEventListener('vybeDnaAdaptationCleared', onCleared);
    return () => window.removeEventListener('vybeDnaAdaptationCleared', onCleared);
  }, [user?.id]);

  const updateSettings = useCallback(async (patch: Partial<AutoPilotSettings>) => {
    if (!user?.id) return;
    const prev = settings;
    // Optimistic update for instant UI feedback
    setSettings(p => p ? { ...p, ...patch } : { ...(patch as any), user_id: user.id });
    const merged = { ...(settings || {} as any), ...patch, user_id: user.id };
    const { id, last_run_at, created_at, updated_at, ...payload } = merged as any;
    const { error } = await db
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
    if (!user?.id || clearingRef.current) return;
    const guard = tokenAccountGuard(user.id);
    try { guard(); } catch { return; }
    const operation = {};
    clearingRef.current = operation;
    setClearing(true);
    refreshRevision.current++;
    try {
      await clearDnaAdaptationData(user.id);
      guard();
      refreshRevision.current++;
      setActions([]);
      try { localStorage.removeItem(`${DNA_ACTIONS_CACHE_KEY}:${user.id}`); } catch { /* Storage may be unavailable. */ }
      await queryClient.cancelQueries({ queryKey: ['dna-content-preferences', user.id], exact: true });
      guard();
      queryClient.setQueryData(['dna-content-preferences', user.id], null);
      window.dispatchEvent(new CustomEvent('vybeDnaAdaptationCleared', { detail: user.id }));
      toast.success('Adaptation data cleared');
      await refresh();
    } catch (error) {
      try { guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'Could not clear adaptation data. Please retry.');
    } finally {
      // Release this request's busy state even after an away-and-back account
      // change. Never release a newer account's or newer request's operation.
      if (clearingRef.current === operation) {
        clearingRef.current = null;
        setClearing(false);
      }
    }
  }, [user?.id, refresh, queryClient]);

  const runNow = useCallback(async () => {
    if (!user?.id || running) return;
    setRunning(true);
    try {
      const { data, error } = await db.functions.invoke('dna-autopilot', { body: { trigger: 'manual' } });
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
      } else if (data?.changesAvailable !== true) {
        toast('Suggestions are ready. Applying Auto-Pilot changes is temporarily unavailable.');
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
    if (!user?.id) return;
    const guard = tokenAccountGuard(user.id);
    try {
      await changeDnaAction(user.id, actionId, false); guard();
      toast.success('Reverted'); await refresh();
    } catch (error) {
      try { guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'Revert failed');
    }
  }, [user?.id, refresh]);

  const applyPending = useCallback(async (actionId: string) => {
    if (!user?.id) return;
    const guard = tokenAccountGuard(user.id);
    try {
      await changeDnaAction(user.id, actionId, true); guard();
      toast.success('Applied'); await refresh();
    } catch (error) {
      try { guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'Apply failed');
    }
  }, [user?.id, refresh]);

  return { settings, actions, loading, loadError, running, clearing, setMode, updateSettings, clearAdaptationData, runNow, revert, applyPending, refresh };
}
