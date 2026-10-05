import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { clearDnaAdaptationData, changeDnaAction, readDnaState, saveDnaSettings, runDnaSuggestions,
  type DnaSettings, type DnaAction, type DnaActor } from '@/lib/dnaAdaptationService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';
import { consumeDnaSettings, guardDnaLocalTheme } from '@/lib/dnaSettingsConsumption';

export type AutoPilotMode = DnaSettings['mode'];
export type AutoPilotIntensity = DnaSettings['max_intensity'];
export type AutoPilotSettings = DnaSettings;
export type AutoPilotAction = DnaAction;
type State = Awaited<ReturnType<typeof readDnaState>>;
interface View { key: string; state: State | null; loading: boolean; loadError: string | null; operationError: string | null; busy: string | null }
const blank = (key: string): View => ({ key, state: null, loading: true, loadError: null, operationError: null, busy: null });

/** Legacy persisted history is deliberately informational, never executable. */
export function normalizeDnaActions(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];
  return value.filter(row => row && typeof row === 'object' && !Array.isArray(row)
    && typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.id) && row.user_id === userId
    && ['feed_tune', 'theme_swap', 'layout_change', 'suggest_user', 'nudge', 'apply_theme', 'navigate', 'generate_theme'].includes(row.action_type)
    && typeof (row.summary ?? row.reason) === 'string' && (row.summary ?? row.reason).trim().length > 0 && (row.summary ?? row.reason).length <= 500
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)))
    .slice(0, 30).map(row => ({ id: row.id, user_id: userId, action_type: row.action_type, summary: row.summary ?? row.reason,
      before: null, after: null, applied: false, reverted: false, created_at: row.created_at }));
}

export function useDNAAutoPilot() {
  const { user, profile } = useAuth(); const session = useReportAccountSession(); const client = useQueryClient();
  const ready = !!user?.id && !!profile?.id && profile.user_id === user.id && session.uid === user.id;
  const key = JSON.stringify([user?.id, profile?.id, profile?.user_id, session.uid, session.epoch]);
  const [stored, setStored] = useState(() => blank(key));
  const view = ready && stored.key === key ? stored : blank(key);
  const live = useRef({ key, mounted: true, generationRevision: 0, readRevision: 0 }); live.current.key = key;
  const operation = useRef<object | null>(null);
  const changeView = useCallback((change: (old: View) => View) => setStored(old => change(old.key === key ? old : blank(key))), [key]);
  const capture = useCallback((): DnaActor => {
    if (!ready) throw new Error('Wait for your signed-in profile to load.');
    const accountGuard = tokenAccountGuard(user.id), revision = live.current.generationRevision;
    return { uid: user.id, profileId: profile.id, guard: () => {
      accountGuard();
      if (!live.current.mounted || live.current.key !== key || live.current.generationRevision !== revision) throw new Error('Your Auto-Pilot session changed. Refresh and retry.');
    } };
  }, [ready, user?.id, profile?.id, key]);
  const refresh = useCallback(async () => {
    if (!ready) return;
    const actor = capture(), revision = ++live.current.readRevision;
    changeView(old => ({ ...old, loading: true, loadError: null }));
    try {
      const state = await readDnaState(actor); actor.guard!();
      if (revision === live.current.readRevision) changeView(old => ({ ...old, state, loading: false, loadError: null }));
    } catch (error) {
      try { actor.guard!(); } catch { return; }
      if (revision === live.current.readRevision) changeView(old => ({ ...old, loading: false, loadError: error instanceof Error ? error.message : 'Could not load Auto-Pilot. Please retry.' }));
    }
  }, [ready, capture, changeView]);
  useEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; live.current.readRevision++; live.current.generationRevision++; }; }, []);
  useEffect(() => {
    live.current.readRevision++; live.current.generationRevision++; operation.current = null; setStored(blank(key));
    // Old disk labels cannot prove today's generation, target state or identity.
    try {
      const keys = new Set(Object.keys(localStorage));
      for (let index = 0; index < localStorage.length; index++) { const name = localStorage.key(index); if (name) keys.add(name); }
      keys.add('vybe-dna-actions-cache'); if (user?.id) keys.add(`vybe-dna-actions-cache:${user.id}`);
      for (const name of keys) if (name.startsWith('vybe-dna-actions-cache')) localStorage.removeItem(name);
    } catch { /* Restricted storage. */ }
    void refresh();
    return () => { live.current.readRevision++; };
  }, [key, refresh]);
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== user?.id) return;
      live.current.generationRevision++; live.current.readRevision++;
      changeView(old => ({ ...old, state: old.state ? { ...old.state, actions: [] } : null }));
      void refresh();
    };
    window.addEventListener('vybeDnaAdaptationCleared', reset);
    return () => window.removeEventListener('vybeDnaAdaptationCleared', reset);
  }, [user?.id, changeView, refresh]);

  const execute = async (name: string, work: (actor: DnaActor) => Promise<void>) => {
    if (operation.current || !ready) return;
    const actor = capture(), current = {}; operation.current = current; live.current.readRevision++;
    changeView(old => ({ ...old, busy: name, operationError: null }));
    try { await work(actor); }
    catch (error) {
      try { actor.guard!(); } catch { return; }
      const message = error instanceof Error ? error.message : 'Auto-Pilot could not confirm this change. Please retry.';
      changeView(old => ({ ...old, operationError: message })); toast.error(message);
    } finally {
      if (operation.current === current) { operation.current = null; changeView(old => ({ ...old, busy: null })); }
    }
  };
  const updateSettings = async (patch: Partial<DnaSettings>) => {
    if (!view.state || view.loading || view.loadError) return;
    await execute('settings', async actor => { await saveDnaSettings(actor, patch, view.state!.settingsVersion); actor.guard!(); await refresh(); });
  };
  const runNow = async () => {
    if (!view.state || view.loading || view.loadError) return;
    await execute('run', async actor => {
      const actions = await runDnaSuggestions(actor); actor.guard!(); await refresh(); actor.guard!();
      toast(actions.length ? 'Suggestions are ready. Review the exact changes below.' : 'No new suggestions yet.');
    });
  };
  const changeAction = async (actionId: string, apply: boolean) => {
    const action = view.state?.actions.find(value => value.id === actionId);
    if (!action?.generation || view.loading || view.loadError) return;
    await execute(actionId, async actor => {
      const localGuard = guardDnaLocalTheme(actor.uid, apply ? action.before : action.after, apply ? action.after : action.before);
      const result = await changeDnaAction(actor.uid, actionId, apply, { actor, generation: action.generation! }); actor.guard!();
      if (!result) throw new Error('The change was not confirmed.');
      await consumeDnaSettings(actor, result.target, client, localGuard); actor.guard!();
      changeView(old => ({ ...old, state: old.state ? { ...old.state, actions: old.state.actions.map(a => a.id === actionId ? result.action : a) } : null }));
      toast.success(apply ? 'Applied' : 'Undone'); await refresh();
    });
  };
  const clearAdaptationData = async () => {
    await execute('clear', async actor => {
      await clearDnaAdaptationData(actor.uid); actor.guard!();
      await client.cancelQueries({ queryKey: ['dna-content-preferences', actor.uid] }); actor.guard!();
      client.setQueriesData({ queryKey: ['dna-content-preferences', actor.uid] }, null);
      changeView(old => ({ ...old, state: old.state ? { ...old.state, actions: [] } : null }));
      toast.success('Adaptation data cleared');
      window.dispatchEvent(new CustomEvent('vybeDnaAdaptationCleared', { detail: actor.uid }));
    });
  };
  return { settings: view.state?.settings || null, actions: view.state?.actions || [], loading: view.loading, loadError: view.loadError,
    operationError: view.operationError, busy: view.busy, savingSettings: view.busy === 'settings', running: view.busy === 'run', clearing: view.busy === 'clear',
    setMode: (mode: AutoPilotMode) => updateSettings({ mode }), updateSettings, runNow, clearAdaptationData,
    applyPending: (id: string) => changeAction(id, true), revert: (id: string) => changeAction(id, false), refresh };
}
