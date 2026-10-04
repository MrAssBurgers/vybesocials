import { runTransaction, Timestamp } from 'firebase/firestore';
import { documentRef, getDocumentFromServer, getFirestoreDb } from './firebase/firestoreDb';
import { PROFILE_VISIBILITY_DEFAULTS, PROFILE_VISIBILITY_FIELDS, isVisibilityLevel, visibilityRow, type ProfileVisibilityField, type ProfileVisibilityLevel } from './profileVisibility';
import type { ReportAccountGuard } from './reportModerationService';

export interface VisibilitySettingsState { fields: Record<ProfileVisibilityField, ProfileVisibilityLevel | 'unavailable'>; needsRepair: boolean }
const validTime = (value: unknown) => typeof value === 'string' ? value.length <= 64 : value instanceof Timestamp;
export function parseVisibilitySettings(value: unknown, profileId: string): VisibilitySettingsState {
  if (value === null) return { fields: { ...PROFILE_VISIBILITY_DEFAULTS }, needsRepair: false };
  if (!visibilityRow(value) || (value.id !== undefined && value.id !== profileId) || (value.user_id !== undefined && value.user_id !== profileId)) throw new Error('These privacy settings could not be verified.');
  const validMap = visibilityRow(value.fields);
  const map = visibilityRow(value.fields) ? value.fields : {};
  const fields = Object.fromEntries(PROFILE_VISIBILITY_FIELDS.map(field => [field, !validMap ? 'unavailable' : map[field] === undefined
    ? PROFILE_VISIBILITY_DEFAULTS[field] : isVisibilityLevel(map[field]) ? map[field] : 'unavailable'])) as VisibilitySettingsState['fields'];
  const badMetadata = Object.keys(value).some(key => !['id', 'user_id', 'fields', 'created_at', 'updated_at'].includes(key))
    || ['created_at', 'updated_at'].some(key => Object.prototype.hasOwnProperty.call(value, key) && !validTime(value[key]));
  return { fields, needsRepair: badMetadata || !validMap || Object.values(fields).includes('unavailable') || Object.keys(map).some(key => !(PROFILE_VISIBILITY_FIELDS as readonly string[]).includes(key)) };
}
export async function readVisibilitySettings(profileId: string, guard: ReportAccountGuard) {
  guard(); const value = await getDocumentFromServer('profile_visibility', profileId); guard();
  return parseVisibilitySettings(value, profileId);
}
export async function writeVisibilitySetting(profileId: string, change: { field: ProfileVisibilityField; level: ProfileVisibilityLevel } | { repair: true }, guard: ReportAccountGuard) {
  guard();
  if ('field' in change && (!(PROFILE_VISIBILITY_FIELDS as readonly string[]).includes(change.field) || !isVisibilityLevel(change.level))) throw new Error('Choose a supported privacy option.');
  const ref = documentRef('profile_visibility', profileId);
  const result = await runTransaction(getFirestoreDb(), async transaction => {
    guard(); const snapshot = await transaction.get(ref); guard();
    const current = parseVisibilitySettings(snapshot.exists() ? snapshot.data() : null, profileId);
    if (current.needsRepair && !('repair' in change)) throw new Error('Review and repair the unavailable options before saving.');
    const fields = Object.fromEntries(PROFILE_VISIBILITY_FIELDS.map(field => [field, current.fields[field] === 'unavailable' ? 'only_me' : current.fields[field]])) as Record<ProfileVisibilityField, ProfileVisibilityLevel>;
    if ('field' in change) fields[change.field] = change.level;
    const payload = { fields, updated_at: new Date().toISOString() };
    guard();
    if (snapshot.exists() && !('repair' in change)) transaction.update(ref, payload);
    else {
      const created = snapshot.exists() ? snapshot.data()?.created_at : undefined;
      // Deliberate repair replaces malformed historical metadata as well as fields.
      transaction.set(ref, { id: profileId, user_id: profileId, ...payload, ...(created !== undefined && validTime(created) ? { created_at: created } : {}) });
    }
    return { fields, needsRepair: false };
  });
  guard(); return result;
}
