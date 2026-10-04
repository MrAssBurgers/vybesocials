import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

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

export async function changeDnaAction(uid: string, actionId: string, applyPending: boolean) {
  const guard = tokenAccountGuard(uid);
  guard();
  const { data, error } = await invokeFunction<unknown>('dna-autopilot-revert', { expectedOwnerUid: uid, actionId, applyPending });
  guard();
  if (error) throw new Error(error.message || 'This Auto-Pilot change is unavailable.');
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true
    || !('ownerUid' in data) || data.ownerUid !== uid || !('actionId' in data) || data.actionId !== actionId
    || !('applied' in data) || data.applied !== applyPending) throw new Error('The Auto-Pilot change was not confirmed.');
}
