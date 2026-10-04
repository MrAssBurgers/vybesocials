import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';

export interface ThemeActor { uid: string; profileId: string; epoch: number }
export function themeActorGuard(actor: ThemeActor, signal?: AbortSignal) {
  const guard = reportAccountGuard(actor.uid);
  return () => {
    guard();
    if (reportAccountSnapshot().epoch !== actor.epoch) throw Object.assign(new Error('Your account changed. Open this theme again.'), { code: 'account-changed' });
    if (signal?.aborted) throw new DOMException('Theme request cancelled', 'AbortError');
  };
}

export async function themeAuthorityRequest(
  actor: ThemeActor, name: string, payload: Record<string, unknown>, signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const guard = themeActorGuard(actor, signal); guard();
  const result = await invokeFunction<unknown>(name, {
    ...payload, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId,
  });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Themes are unavailable. Please try again.'), { code: result.error.name });
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error('The theme action was not confirmed. Please retry.');
  return result.data as Record<string, unknown>;
}

// Retain only a digest and random request ID across retries, never theme content
// or recipient identities. Completing a request permits a deliberate new share.
const pending = new Map<string, string>();
const storageKey = 'vybe-theme-requests-v1';
function stored(): Record<string, string> {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    return Object.fromEntries(Object.entries(value).filter(([key, id]) => /^[a-f0-9]{64}$/.test(key) && typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)).slice(-64)) as Record<string, string>;
  } catch { return {}; }
}
function persist(key: string, requestId?: string) {
  try {
    const entries = stored();
    if (requestId) entries[key] = requestId; else delete entries[key];
    sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-64))));
  } catch { /* Memory retains retry identity when storage is unavailable. */ }
}
export async function themeAttempt(actor: ThemeActor, action: string, payload: unknown) {
  const guard = themeActorGuard(actor); guard();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.uid, actor.profileId, action, payload])));
  guard();
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const requestId = pending.get(key) || stored()[key] || crypto.randomUUID();
  pending.set(key, requestId); persist(key, requestId);
  while (pending.size > 64) pending.delete(pending.keys().next().value!);
  return { requestId, complete: () => { pending.delete(key); persist(key); } };
}
