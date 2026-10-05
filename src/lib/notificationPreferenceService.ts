import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard, type TokenAccountGuard } from '@/lib/tokenMarketplaceService';

export const notificationBooleanKeys = ['likes_enabled', 'comments_enabled', 'follows_enabled', 'mentions_enabled', 'dms_enabled', 'calls_enabled', 'friend_requests_enabled', 'streaks_enabled', 'stories_enabled', 'show_message_preview', 'marketplace_enabled', 'events_enabled', 'system_enabled', 'announcements_enabled', 'nearby_enabled', 'brief_pings_enabled', 'friend_activity_enabled', 'trending_local_enabled'] as const;
export type NotificationBooleanKey = typeof notificationBooleanKeys[number];
export type NotificationPreferences = Record<NotificationBooleanKey, boolean> & { id: string; user_id: string; quiet_hours_start: string | null; quiet_hours_end: string | null; smart_ping_radius_miles: number; smart_ping_max_per_day: number; brief_muted_until: number | null };
export type NotificationPreferenceActor = { uid: string; profileId: string };
export type NotificationPreferenceState = { revision: string; preferences: NotificationPreferences };
type Request = { action: 'read' } | { action: 'set'; key: NotificationBooleanKey; value: boolean; revision: string; requestId: string };
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function checkedNotificationPreferences(value: unknown, actor: NotificationPreferenceActor): NotificationPreferenceState {
  if (!row(value) || value.ok !== true || value.ownerUid !== actor.uid || value.profileId !== actor.profileId || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision) || !row(value.values)) throw new Error('Notification settings were not confirmed. Please retry.');
  const prefs = value.values;
  if (notificationBooleanKeys.some(key => typeof prefs[key] !== 'boolean') || ['quiet_hours_start', 'quiet_hours_end'].some(key => prefs[key] !== null && (typeof prefs[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs[key] as string)))
    || !Number.isInteger(prefs.smart_ping_radius_miles) || Number(prefs.smart_ping_radius_miles) < 0 || Number(prefs.smart_ping_radius_miles) > 100
    || !Number.isInteger(prefs.smart_ping_max_per_day) || Number(prefs.smart_ping_max_per_day) < 0 || Number(prefs.smart_ping_max_per_day) > 24
    || (prefs.brief_muted_until != null && (!Number.isSafeInteger(prefs.brief_muted_until) || Number(prefs.brief_muted_until) < 0))) throw new Error('Notification settings returned an invalid response. Please retry.');
  return { revision: value.revision, preferences: { ...prefs, brief_muted_until: prefs.brief_muted_until ?? null, id: actor.uid, user_id: actor.profileId } as NotificationPreferences };
}

type MuteAttempt = { requestId: string; revision: string };
const MUTE_STORAGE = 'vybe-notification-mute-attempts-v1';
const muteMemory = new Map<string, MuteAttempt>();
function muteStored(): Record<string, MuteAttempt> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(MUTE_STORAGE) || '{}');
    return row(parsed) ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.length < 700 && row(value) && typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.requestId) && typeof value.revision === 'string' && /^[a-f0-9]{64}$/.test(value.revision)).slice(-32)) as Record<string, MuteAttempt> : {};
  } catch { return {}; }
}
/** Retain the original revision as well as request ID after an uncertain reply.
 * A new read must never silently turn retry into a new one-hour extension. */
export async function muteSmartPingsForOneHour(actor: NotificationPreferenceActor, guard: TokenAccountGuard = tokenAccountGuard(actor.uid)) {
  guard();
  const key = JSON.stringify([actor.uid, actor.profileId]);
  let attempt = muteMemory.get(key) || muteStored()[key];
  const clear = () => {
    muteMemory.delete(key); const saved = muteStored(); delete saved[key];
    try { sessionStorage.setItem(MUTE_STORAGE, JSON.stringify(saved)); } catch { /* Memory fallback. */ }
  };
  if (!attempt) {
    const state = await notificationPreferenceRequest(actor, { action: 'read' }, guard);
    guard();
    attempt = { requestId: crypto.randomUUID(), revision: state.revision };
    muteMemory.set(key, attempt);
    while (muteMemory.size > 32) muteMemory.delete(muteMemory.keys().next().value!);
    try { sessionStorage.setItem(MUTE_STORAGE, JSON.stringify(Object.fromEntries(Object.entries({ ...muteStored(), [key]: attempt }).slice(-32)))); } catch { /* Memory fallback. */ }
  }
  guard();
  const result = await invokeFunction<unknown>('mute-smart-pings', { hours: 1, ...attempt, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  guard();
  if (result.error) {
    const code = result.error.code || result.error.name || '';
    // A definitive conflict requires a new deliberate action, never auto-retry.
    if (/(^|\/)(aborted|already-exists|invalid-argument)$/.test(code)) clear();
    throw Object.assign(new Error(result.error.message || 'The one-hour mute was not confirmed. Please try again.'), { code });
  }
  const state = checkedNotificationPreferences(result.data, actor);
  clear();
  return state;
}
export async function notificationPreferenceRequest(actor: NotificationPreferenceActor, request: Request, guard: TokenAccountGuard = tokenAccountGuard(actor.uid)) {
  guard();
  const result = await invokeFunction<unknown>('manage-notification-preferences', { ...request, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Notification settings are unavailable. Please retry.'), { code: result.error.code || result.error.name });
  return checkedNotificationPreferences(result.data, actor);
}

const STORAGE = 'vybe-notification-preference-attempts-v1';
const memory = new Map<string, string>();
function stored(): Record<string, string> {
  try { const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '{}'); return row(parsed) ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.length < 700 && typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)).slice(-32)) as Record<string, string> : {}; } catch { return {}; }
}
export function notificationPreferenceAttempt(actor: NotificationPreferenceActor, key: NotificationBooleanKey, value: boolean, revision: string) {
  const fingerprint = JSON.stringify([actor.uid, actor.profileId, key, value, revision]);
  const values = stored();
  const requestId = memory.get(fingerprint) || values[fingerprint] || crypto.randomUUID();
  memory.set(fingerprint, requestId); values[fingerprint] = requestId;
  while (memory.size > 32) memory.delete(memory.keys().next().value!);
  try { sessionStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-32)))); } catch { /* Memory still retains retries. */ }
  return { requestId, complete: () => {
    memory.delete(fingerprint); const current = stored(); delete current[fingerprint];
    try { sessionStorage.setItem(STORAGE, JSON.stringify(current)); } catch { /* Restricted storage. */ }
  } };
}
