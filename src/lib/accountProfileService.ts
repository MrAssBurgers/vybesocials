import { getFirebaseAuth } from './firebase/authService';
import { invokeFunction } from './firebase/functionsService';
import type { UserProfile } from './firebase/types';
import { profileAccountGuard, withProfileSetupDeadline } from './profileAccountGuard';

export { profileSetupFailure, type ProfileSetupError } from './profileAccountGuard';
export type AccountProfileAction = 'ensure' | 'syncIndex' | 'recover';
export type AccountProfileDefaults = { username?: string; displayName?: string; avatarUrl?: string | null; bio?: string; onboardingCompleted?: false };
type Request = { action: AccountProfileAction; expectedOwnerUid: string; expectedAccountCreatedAt: number; requestId: string; expectedProfileId?: string; defaults?: AccountProfileDefaults };
export type AccountProfileReceipt = { ok: true; ownerUid: string; accountCreatedAt: number; requestId: string; action: AccountProfileAction; status: 'ready'; profileId: string; profile: UserProfile; bindingRevision: string; created: boolean; recovered: boolean };
const STORAGE = 'vybe:profile-setup-attempts:v1';
const attempts = new Map<string, Request>();
const inflightProfiles = new Map<string, Promise<AccountProfileReceipt>>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');

function attemptKey(value: Pick<Request, 'action' | 'expectedOwnerUid' | 'expectedAccountCreatedAt' | 'expectedProfileId'>) {
  return JSON.stringify([value.expectedOwnerUid, value.expectedAccountCreatedAt, value.action, value.expectedProfileId ?? null]);
}
function persist() {
  while (attempts.size > 32) attempts.delete(attempts.keys().next().value!);
  try { sessionStorage.setItem(STORAGE, JSON.stringify([...attempts.values()])); } catch { /* Memory still preserves same-tab retries. */ }
}
function retainedRequest(input: Omit<Request, 'requestId'>): Request {
  if (!attempts.size) {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '[]');
      if (Array.isArray(stored)) for (const row of stored.slice(-32)) {
        if (row && id(row.expectedOwnerUid) && Number.isSafeInteger(row.expectedAccountCreatedAt) && row.expectedAccountCreatedAt > 0 && uuid.test(row.requestId) && ['ensure', 'syncIndex', 'recover'].includes(row.action) && (row.expectedProfileId === undefined || id(row.expectedProfileId))) {
          const defaults = row.defaults;
          if (defaults !== undefined && (!defaults || typeof defaults !== 'object' || Array.isArray(defaults) || Object.keys(defaults).some(key => !['username', 'displayName', 'avatarUrl', 'bio', 'onboardingCompleted'].includes(key)) || Object.entries(defaults).some(([key, value]) => key === 'onboardingCompleted' ? value !== false : key === 'avatarUrl' && value === null ? false : typeof value !== 'string' || value.length > 2000))) continue;
          attempts.set(attemptKey(row), { action: row.action, expectedOwnerUid: row.expectedOwnerUid, expectedAccountCreatedAt: row.expectedAccountCreatedAt, requestId: row.requestId, ...(row.expectedProfileId ? { expectedProfileId: row.expectedProfileId } : {}), ...(defaults ? { defaults } : {}) });
        }
      }
    } catch { /* Malformed local recovery data cannot establish identity. */ }
  }
  const key = attemptKey(input), previous = attempts.get(key);
  const request = previous ?? { ...input, requestId: crypto.randomUUID() };
  attempts.set(key, request); persist();
  return request;
}

export async function provisionAccountProfile(uid: string, options: { action?: AccountProfileAction; expectedProfileId?: string; defaults?: AccountProfileDefaults } = {}, extraGuard?: () => void): Promise<AccountProfileReceipt> {
  const guard = profileAccountGuard(uid, extraGuard);
  const firebaseUser = getFirebaseAuth()?.currentUser;
  const createdAt = Date.parse(firebaseUser?.metadata.creationTime || '');
  if (!firebaseUser || firebaseUser.uid !== uid || !Number.isSafeInteger(createdAt) || createdAt <= 0) throw new Error('Sign in again to confirm this account before loading your profile.');
  const action = options.action || 'ensure';
  if (action === 'syncIndex' && !id(options.expectedProfileId)) throw new Error('A confirmed profile is required.');
  const request = retainedRequest({ action, expectedOwnerUid: uid, expectedAccountCreatedAt: createdAt, ...(options.expectedProfileId ? { expectedProfileId: options.expectedProfileId } : {}), ...(action === 'ensure' && options.defaults ? { defaults: options.defaults } : {}) });
  guard();
  const flightKey = attemptKey(request);
  const existing = inflightProfiles.get(flightKey);
  if (existing) {
    const shared = await existing;
    guard();
    return shared;
  }
  let resolveShared!: (value: AccountProfileReceipt) => void;
  let rejectShared!: (error: unknown) => void;
  const shared = new Promise<AccountProfileReceipt>((resolve, reject) => { resolveShared = resolve; rejectShared = reject; });
  void shared.catch(() => {});
  inflightProfiles.set(flightKey, shared);
  const finish = (error?: unknown, receipt?: AccountProfileReceipt) => {
    if (inflightProfiles.get(flightKey) === shared) inflightProfiles.delete(flightKey);
    if (error) rejectShared(error);
    else resolveShared(receipt!);
  };
  try {
  const { data, error } = await withProfileSetupDeadline(async current => {
    current();
    // Functions' SDK suppresses token transport errors and sends the call
    // without Auth. Preserve that failure so startup can recover connectivity
    // rather than mistake a restored account for an unauthenticated caller.
    await firebaseUser.getIdToken();
    current();
    if (getFirebaseAuth()?.currentUser !== firebaseUser) throw Object.assign(new Error('Your account changed.'), { code: 'account-changed' });
    const result = await invokeFunction<unknown>('ensureAccountProfile', request);
    current();
    return result;
  }, guard);
  guard();
  if (getFirebaseAuth()?.currentUser !== firebaseUser) throw Object.assign(new Error('Your account changed.'), { code: 'account-changed' });
  if (error) {
    const code = String(error.code || error.name || '').replace(/^functions\//, '');
    if (['invalid-argument', 'already-exists'].includes(code)) { attempts.delete(attemptKey(request)); persist(); }
    throw error;
  }
  const row = data as Partial<AccountProfileReceipt> | null;
  if (!row || row.ok !== true || row.ownerUid !== uid || row.accountCreatedAt !== createdAt || row.requestId !== request.requestId || row.action !== action || row.status !== 'ready' || !id(row.profileId) || !/^[a-f0-9]{48}$/.test(row.bindingRevision || '') || typeof row.created !== 'boolean' || typeof row.recovered !== 'boolean' || !row.profile || row.profile.id !== row.profileId || row.profile.user_id !== uid || (row.profile.username != null && typeof row.profile.username !== 'string') || (options.expectedProfileId && row.profileId !== options.expectedProfileId)) throw Object.assign(new Error('Profile setup returned an invalid confirmation. Try again.'), { code: 'profile-service-invalid-response' });
  attempts.delete(attemptKey(request)); persist();
  const receipt = { ...row, profile: { ...row.profile, username: row.profile.username ?? '' } } as AccountProfileReceipt;
  finish(undefined, receipt);
  return receipt;
  } catch (error) {
    finish(error);
    throw error;
  }
}
