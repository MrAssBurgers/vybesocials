import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';
import { normalizeSharedThemeTokens } from '@/lib/sharedThemeSchema';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

const pending = new Map<string, string>();
const storageKey = (uid: string) => `vybe-dna-reset-request:${uid}`;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function resetRequest(uid: string) {
  let id = pending.get(uid);
  try { if (!id) id = sessionStorage.getItem(storageKey(uid)) ?? undefined; } catch { /* In-memory retry still works. */ }
  if (!validId(id)) id = crypto.randomUUID();
  pending.set(uid, id);
  try { sessionStorage.setItem(storageKey(uid), id); } catch { /* Restricted storage. */ }
  return id;
}

export async function clearDnaAdaptationData(uid: string) {
  const guard = tokenAccountGuard(uid);
  guard();
  let requestId = resetRequest(uid);
  const invoke = async () => {
    guard();
    const result = await invokeFunction<unknown>('clear-dna-adaptation-data', { expectedOwnerUid: uid, requestId });
    guard();
    if (result.error) throw Object.assign(new Error(result.error.message || 'Could not clear adaptation data. Please retry.'), { code: result.error.code || result.error.name });
    return result.data;
  };
  let data = await invoke();
  if (data && typeof data === 'object' && 'success' in data && data.success === false
    && 'ownerUid' in data && data.ownerUid === uid && 'requestId' in data && data.requestId === requestId
    && 'pendingRequestId' in data && validId(data.pendingRequestId)) {
    requestId = data.pendingRequestId;
    pending.set(uid, requestId);
    try { sessionStorage.setItem(storageKey(uid), requestId); } catch { /* In-memory recovery. */ }
    data = await invoke();
  }
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true
    || !('ownerUid' in data) || data.ownerUid !== uid || !('requestId' in data) || data.requestId !== requestId
    || !('deleted' in data) || !Number.isSafeInteger(data.deleted) || Number(data.deleted) < 0) {
    throw new Error('The adaptation reset was not confirmed. Please retry.');
  }
  pending.delete(uid);
  try { if (sessionStorage.getItem(storageKey(uid)) === requestId) sessionStorage.removeItem(storageKey(uid)); } catch { /* Restricted storage. */ }
  return { deleted: Number(data.deleted) };
}

export interface DnaActor { uid: string; profileId: string; guard?: () => void }
export type DnaTarget = { kind: 'theme'; tokens: ThemeTokens | null; preset: string | null }
  | { kind: 'layout'; config: Record<string, unknown>; safeMode: boolean; configVersion: number }
  | { kind: 'feed'; preferences: { boost_topics: string[]; reduce_topics: string[] } | null };
export interface DnaAction {
  id: string; user_id: string; action_type: string; summary: string; created_at: string;
  phase: 'informational' | 'suggested' | 'applied' | 'reverted'; applied: boolean; reverted: boolean;
  change: Record<string, unknown> | null; before: DnaTarget | null; after: DnaTarget | null; generation: string | null;
}
export interface DnaSettings {
  user_id: string; mode: 'off' | 'suggest' | 'autonomous'; cadence_minutes: number; last_run_at: string | null;
  trigger_on_post: boolean; trigger_on_follow: boolean; trigger_on_session: boolean;
  max_intensity: 'gentle' | 'balanced' | 'bold'; learning_paused: boolean; personalization_opted_out: boolean;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new Error('The Auto-Pilot response was not confirmed. Refresh and retry.');
const layoutValues: Record<string, string[]> = { fontScale: ['small', 'medium', 'large', 'xlarge'], contrastLevel: ['low', 'medium', 'high'], buttonStyle: ['glass', 'solid', 'outline'], motionIntensity: ['low', 'medium', 'high'] };
function validChange(value: unknown) {
  if (!record(value)) return false;
  if (value.type === 'apply_theme') return Object.keys(value).every(k => ['type', 'preset'].includes(k)) && ['classic', 'midnight', 'neon', 'soft', 'cyberpunk', 'minimal'].includes(String(value.preset));
  if (!record(value.patch) || !Object.keys(value.patch).length || Object.keys(value).some(k => !['type', 'patch'].includes(k))) return false;
  if (value.type === 'layout_change') return Object.entries(value.patch).every(([k, v]) => typeof v === 'string' && layoutValues[k]?.includes(v));
  return value.type === 'feed_tune' && Object.entries(value.patch).every(([k, v]) => ['boost_topics', 'reduce_topics'].includes(k) && Array.isArray(v) && v.length <= 10 && v.every(t => typeof t === 'string' && t.trim().length > 0 && t.length <= 40));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function normalizeDnaTarget(value: unknown): DnaTarget {
  if (!record(value)) throw invalid();
  if (value.kind === 'theme' && (value.preset === null || typeof value.preset === 'string')) return { kind: 'theme',
    tokens: value.tokens === null ? null : normalizeSharedThemeTokens(value.tokens) as unknown as ThemeTokens, preset: value.preset as string | null };
  if (value.kind === 'layout' && record(value.config) && typeof value.safeMode === 'boolean' && Number.isSafeInteger(value.configVersion)) return value as unknown as DnaTarget;
  if (value.kind === 'feed') {
    if (value.preferences === null) return { kind: 'feed', preferences: null };
    if (record(value.preferences) && ['boost_topics', 'reduce_topics'].every(k => Array.isArray(value.preferences![k]) && (value.preferences![k] as unknown[]).length <= 10 && (value.preferences![k] as unknown[]).every(t => typeof t === 'string' && t.length <= 40))) return value as unknown as DnaTarget;
  }
  throw invalid();
}
export function parseDnaAction(value: unknown, uid: string): DnaAction {
  if (!record(value) || !validId(value.id) || value.user_id !== uid || typeof value.action_type !== 'string'
    || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 500
    || typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))
    || !['informational', 'suggested', 'applied', 'reverted'].includes(String(value.phase))
    || value.applied !== (value.phase === 'applied') || value.reverted !== (value.phase === 'reverted')) throw invalid();
  if (value.phase !== 'informational' && (!record(value.change) || !validChange(value.change) || !['feed_tune', 'layout_change', 'apply_theme'].includes(value.action_type)
    || value.change.type !== value.action_type || typeof value.generation !== 'string' || value.before === null || value.after === null)) throw invalid();
  const before = value.before === null ? null : normalizeDnaTarget(value.before), after = value.after === null ? null : normalizeDnaTarget(value.after);
  const kind = value.action_type === 'apply_theme' ? 'theme' : value.action_type === 'layout_change' ? 'layout' : 'feed';
  if (value.phase !== 'informational' && (before?.kind !== kind || after?.kind !== kind)) throw invalid();
  return { ...value, before, after } as unknown as DnaAction;
}
function parseSettings(value: unknown, uid: string): DnaSettings {
  if (!record(value) || value.user_id !== uid || !['off', 'suggest', 'autonomous'].includes(String(value.mode))
    || !['gentle', 'balanced', 'bold'].includes(String(value.max_intensity)) || !Number.isSafeInteger(value.cadence_minutes)
    || Number(value.cadence_minutes) < 30 || Number(value.cadence_minutes) > 1440
    || !['trigger_on_post', 'trigger_on_follow', 'trigger_on_session', 'learning_paused', 'personalization_opted_out'].every(k => typeof value[k] === 'boolean')
    || !(value.last_run_at === null || (typeof value.last_run_at === 'string' && Number.isFinite(Date.parse(value.last_run_at))))) throw invalid();
  return value as unknown as DnaSettings;
}
async function dnaRequest(actor: DnaActor, body: Record<string, unknown>, endpoint = 'dna-autopilot-revert') {
  const guard = tokenAccountGuard(actor.uid); guard(); actor.guard?.();
  const result = await invokeFunction<unknown>(endpoint, { expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, ...body });
  guard(); actor.guard?.();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Auto-Pilot is unavailable. Please retry.'), { code: result.error.code });
  const value = result.data;
  if (!record(value) || value.ownerUid !== actor.uid || value.profileId !== actor.profileId || typeof value.generation !== 'string'
    || !(value.success === true || value.ok === true)) throw invalid();
  return value;
}
const attempts = new Map<string, string>();
const actionAttemptsKey = 'vybe-dna-action-attempts-v1';
function attemptId(key: string) {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(actionAttemptsKey) || '{}');
    if (record(stored)) for (const [name, value] of Object.entries(stored).slice(-64)) if (name.length <= 2048 && validId(value) && !attempts.has(name)) attempts.set(name, value);
  } catch { /* Memory retry. */ }
  let id = attempts.get(key);
  if (!validId(id)) id = crypto.randomUUID();
  attempts.delete(key); attempts.set(key, id);
  while (attempts.size > 64) attempts.delete(attempts.keys().next().value!);
  try { sessionStorage.setItem(actionAttemptsKey, JSON.stringify(Object.fromEntries(attempts))); } catch { /* Memory retry. */ }
  return id;
}
export async function readDnaState(actor: DnaActor) {
  const value = await dnaRequest(actor, { operation: 'state' });
  if (!Array.isArray(value.actions) || value.actions.length > 30 || !(value.settingsVersion === null || typeof value.settingsVersion === 'string')) throw invalid();
  const actions = value.actions.map(action => parseDnaAction(action, actor.uid));
  if (new Set(actions.map(a => a.id)).size !== actions.length || actions.some(a => a.phase !== 'informational' && a.generation !== value.generation)) throw invalid();
  return { settings: parseSettings(value.settings, actor.uid), settingsVersion: value.settingsVersion as string | null, actions, generation: value.generation as string };
}
export async function saveDnaSettings(actor: DnaActor, patch: Partial<DnaSettings>, settingsVersion: string | null) {
  const requestId = attemptId(JSON.stringify([actor.uid, actor.profileId, 'settings', settingsVersion, patch]));
  const value = await dnaRequest(actor, { operation: 'settings', patch, settingsVersion, requestId });
  if (value.requestId !== requestId) throw invalid();
  return parseSettings(value.settings, actor.uid);
}
export async function runDnaSuggestions(actor: DnaActor) {
  const value = await dnaRequest(actor, { trigger: 'manual' }, 'dna-autopilot');
  if (!Array.isArray(value.actions)) throw invalid();
  return value.actions.map(action => parseDnaAction(action, actor.uid));
}
export async function changeDnaAction(uid: string, actionId: string, applyPending: boolean, options?: { actor: DnaActor; generation: string }) {
  const guard = tokenAccountGuard(uid);
  guard();
  if (options) {
    if (uid !== options.actor.uid || !validId(actionId)) throw invalid();
    const requestId = attemptId(JSON.stringify([uid, options.actor.profileId, actionId, applyPending, options.generation]));
    const data = await dnaRequest(options.actor, { operation: 'change', actionId, applyPending, generation: options.generation, requestId });
    if (data.requestId !== requestId || data.actionId !== actionId || data.generation !== options.generation || data.applied !== applyPending || data.phase !== (applyPending ? 'applied' : 'reverted')) throw invalid();
    const action = parseDnaAction(data.action, uid), target = normalizeDnaTarget(data.target);
    if (action.id !== actionId || action.phase !== data.phase || action.generation !== options.generation || canonical(target) !== canonical(applyPending ? action.after : action.before)) throw invalid();
    return { action, target };
  }
  const { data, error } = await invokeFunction<unknown>('dna-autopilot-revert', { expectedOwnerUid: uid, actionId, applyPending });
  guard();
  if (error) throw new Error(error.message || 'This Auto-Pilot change is unavailable.');
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true
    || !('ownerUid' in data) || data.ownerUid !== uid || !('actionId' in data) || data.actionId !== actionId
    || !('applied' in data) || data.applied !== applyPending) throw new Error('The Auto-Pilot change was not confirmed.');
}
