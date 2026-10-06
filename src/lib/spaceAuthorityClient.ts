import { invokeFunction } from '@/lib/firebase/functionsService';
import { spaceActorGuard, type SpaceActor } from '@/lib/spaceAccountSession';
export { spaceActorGuard, type SpaceActor } from '@/lib/spaceAccountSession';

export async function spaceAuthorityRequest<T>(actor: SpaceActor, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const guard = spaceActorGuard(actor, signal); guard();
  const result = await invokeFunction<unknown>('manageSpaces', { ...payload, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'This room could not be reached. Please retry.'), { code: result.error.name });
  const data = result.data as Record<string, unknown> | null;
  if (!data || data.ok !== true || data.ownerUid !== actor.uid || data.profileId !== actor.profileId || data.action !== payload.action) throw new Error('The room response could not be confirmed. Please retry.');
  return data as T;
}
interface Attempt { requestId: string; revision?: number }
const pending = new Map<string, Attempt>();
const storageKey = 'vybe-space-requests-v1';
function stored(): Record<string, Attempt> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => {
      const v = value as Attempt;
      return /^[a-f0-9]{64}$/.test(key) && v && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.requestId) && (v.revision === undefined || (Number.isSafeInteger(v.revision) && v.revision >= 0));
    }).slice(-64)) as Record<string, Attempt>;
  } catch { return {}; }
}
function persist(key: string, value?: Attempt) {
  try {
    const all = stored(); if (value) all[key] = value; else delete all[key];
    sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-64))));
  } catch { /* The in-memory retry remains available. */ }
}
/** An uncertain retry must reuse both the receipt ID and the original revision. */
export async function spaceMutation<T>(actor: SpaceActor, action: string, intent: Record<string, unknown>, revision?: number): Promise<T> {
  const guard = spaceActorGuard(actor); guard();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.uid, actor.profileId, actor.epoch, action, intent])));
  guard();
  const key = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  const attempt = pending.get(key) || stored()[key] || { requestId: crypto.randomUUID(), ...(revision === undefined ? {} : { revision }) };
  pending.set(key, attempt); persist(key, attempt);
  while (pending.size > 64) pending.delete(pending.keys().next().value!);
  const complete = () => { guard(); pending.delete(key); persist(key); };
  try {
    const result = await spaceAuthorityRequest<T>(actor, { action, ...intent, ...attempt });
    complete(); return result;
  } catch (error) {
    // Only a definite rejection permits a new intent after refreshing state.
    if (['invalid-argument', 'failed-precondition', 'permission-denied', 'not-found', 'already-exists', 'unauthenticated'].includes((error as { code?: string }).code || '')) complete();
    throw error;
  }
}
