import { documentId, getDocsFromServer, limit, orderBy, query, startAfter, where, type DocumentData, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { collectionRef } from '@/lib/firebase/firestoreDb';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard, type TokenAccountGuard } from '@/lib/tokenMarketplaceService';

export type SignInPreference = 'email_2fa_enabled' | 'login_approvals_enabled';
export interface SignInPreferences {
  settings: Record<SignInPreference, boolean>;
  revision: string;
  capabilities: { enableEmailConfirmation: boolean; enableLoginApprovals: boolean };
}
const isRow = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const failed = () => new Error('Security settings could not be confirmed. Please retry.');
function checkedPreferences(raw: unknown, uid: string): SignInPreferences {
  if (!isRow(raw) || raw.ok !== true || raw.ownerUid !== uid || !isRow(raw.settings) || !isRow(raw.capabilities)
    || typeof raw.settings.email_2fa_enabled !== 'boolean' || typeof raw.settings.login_approvals_enabled !== 'boolean'
    || typeof raw.capabilities.enableEmailConfirmation !== 'boolean' || typeof raw.capabilities.enableLoginApprovals !== 'boolean'
    || typeof raw.revision !== 'string' || !/^(missing|\d+:\d+)$/.test(raw.revision)) throw failed();
  return { settings: { email_2fa_enabled: raw.settings.email_2fa_enabled, login_approvals_enabled: raw.settings.login_approvals_enabled },
    revision: raw.revision, capabilities: { enableEmailConfirmation: raw.capabilities.enableEmailConfirmation, enableLoginApprovals: raw.capabilities.enableLoginApprovals } };
}
async function call(name: string, body: Record<string, unknown>, guard: TokenAccountGuard) {
  guard(); const result = await invokeFunction<unknown>(name, body); guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Security settings are unavailable. Please retry.'), { code: result.error.code || result.error.name });
  return result.data;
}
export async function readSignInPreferences(uid: string, guard = tokenAccountGuard(uid)) {
  return checkedPreferences(await call('manage-sign-in-preferences', { action: 'read', expectedOwnerUid: uid }, guard), uid);
}
export async function updateSignInPreference(uid: string, current: SignInPreferences, field: SignInPreference, value: boolean, requestId: string, guard = tokenAccountGuard(uid)) {
  if (!['email_2fa_enabled', 'login_approvals_enabled'].includes(field) || typeof value !== 'boolean') throw failed();
  const result = await call('manage-sign-in-preferences', { action: 'update', expectedOwnerUid: uid, expectedRevision: current.revision, requestId, patch: { [field]: value } }, guard);
  const checked = checkedPreferences(result, uid);
  if (!isRow(result) || result.requestId !== requestId || result.phase !== 'applied' || checked.settings[field] !== value) throw new Error('Your sign-in preferences changed. Refresh before trying again.');
  return checked;
}

export interface SecurityDevice {
  id: string; deviceLabel: string; location: string | null; ip: string | null;
  trusted: boolean; lastSeenAt: string | null;
}
export interface SecurityLogin { id: string; method: string; deviceLabel: string; location: string | null; success: boolean | null; createdAt: string | null }
export type SecurityDeviceCursor = QueryDocumentSnapshot<DocumentData>;
const text = (value: unknown, max = 100) => typeof value === 'string' && value.length <= max ? value : null;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
function ownRow(value: DocumentData, uid: string) {
  if (value.user_id !== uid) throw failed();
  return value;
}
function location(row: DocumentData) { return [text(row.city), text(row.region), text(row.country)].filter(Boolean).join(', ') || null; }
export async function readSecurityDevices(uid: string, guard = tokenAccountGuard(uid), cursor?: SecurityDeviceCursor) {
  guard();
  if (cursor && (cursor.data().user_id !== uid || cursor.ref.parent.id !== 'user_sessions')) throw failed();
  const constraints: QueryConstraint[] = [where('user_id', '==', uid), where('revoked_at', '==', null), orderBy('last_seen_at', 'desc'), orderBy(documentId(), 'desc'), limit(51)];
  if (cursor) constraints.push(startAfter(cursor));
  const snap = await getDocsFromServer(query(collectionRef('user_sessions'), ...constraints)); guard();
  const page = snap.docs.slice(0, 50);
  return { devices: page.map(doc => {
    const row = ownRow(doc.data(), uid);
    return { id: doc.id, deviceLabel: text(row.device_label) || 'Unknown device', location: location(row), ip: text(row.ip, 64), trusted: row.trusted === true, lastSeenAt: date(row.last_seen_at) };
  }), cursor: snap.docs.length > 50 ? page[page.length - 1] : null };
}
export async function readSecurityHistory(uid: string, guard = tokenAccountGuard(uid)): Promise<SecurityLogin[]> {
  guard(); const snap = await getDocsFromServer(query(collectionRef('login_history'), where('user_id', '==', uid), orderBy('created_at', 'desc'), limit(10))); guard();
  return snap.docs.map(doc => { const row = ownRow(doc.data(), uid); return { id: doc.id, method: text(row.method, 40) || 'Sign-in', deviceLabel: text(row.device_label) || 'Unknown device', location: location(row), success: typeof row.success === 'boolean' ? row.success : null, createdAt: date(row.created_at) }; });
}
export async function revokeAllSecuritySessions(uid: string, requestId: string, expectedAuthTime: number, guard = tokenAccountGuard(uid)) {
  const result = await call('auth-session-revoke', { all: true, confirmation: 'all-devices', expectedOwnerUid: uid, expectedAuthTime, requestId }, guard);
  if (!isRow(result) || result.ok !== true || result.ownerUid !== uid || result.requestId !== requestId || result.authTime !== expectedAuthTime || result.scope !== 'all-refresh-tokens'
    || result.existingAccessMayContinue !== true || typeof result.revokedBefore !== 'string' || !Number.isFinite(Date.parse(result.revokedBefore))
    || Date.parse(result.revokedBefore) > Date.now() + 1000 || !Number.isInteger(result.trackedSessionsMarked) || Number(result.trackedSessionsMarked) < 0 || Number(result.trackedSessionsMarked) > 200) throw failed();
  return { revokedBefore: result.revokedBefore, trackedSessionsMarked: Number(result.trackedSessionsMarked) };
}
