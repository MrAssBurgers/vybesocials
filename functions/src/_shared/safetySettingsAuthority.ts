import type { Firestore, Transaction, DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { ParentalActor } from './parentalAccountAuthority.js';
type Row = Record<string, unknown>;
export const safetyDefaults = { content_filter_level: 'moderate', dm_filter: 'friends_only', dm_content_filter_enabled: true,
  message_requests_enabled: true, quiet_hours_enabled: false, quiet_hours_start: null, quiet_hours_end: null, muted_keywords: [],
  show_global_events: true, take_a_break_reminder: true, break_reminder_interval_hours: 2 };
export const childSafetyDefaults = { content_filter_level: 'protected', dm_filter: 'friends_only', dm_content_filter_enabled: true,
  message_requests_enabled: false, quiet_hours_enabled: true, quiet_hours_start: '21:00', quiet_hours_end: '07:00',
  take_a_break_reminder: true, break_reminder_interval_hours: 1 };
export function validateSafetyUpdates(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(safetyDefaults, key))) throw new HttpsError('invalid-argument', 'Use valid safety settings.');
  for (const [key, item] of Object.entries(value)) {
    const valid = key === 'content_filter_level' ? ['protected', 'moderate', 'minimal'].includes(item as string)
      : key === 'dm_filter' ? ['everyone', 'friends_only', 'nobody'].includes(item as string)
      : key === 'quiet_hours_start' || key === 'quiet_hours_end' ? item === null || typeof item === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item)
      : key === 'muted_keywords' ? Array.isArray(item) && item.length <= 100 && item.every(word => typeof word === 'string' && word.trim().length > 0 && word.length <= 100)
      : key === 'break_reminder_interval_hours' ? Number.isInteger(item) && Number(item) >= 1 && Number(item) <= 24
      : typeof item === 'boolean';
    if (!valid) throw new HttpsError('invalid-argument', 'Use valid safety settings.');
  }
  return value as Row;
}
const review = () => new HttpsError('failed-precondition', 'These safety settings need an ownership review. Nothing was changed.');
export async function readSafetyRow(db: Firestore, tx: Transaction, actor: ParentalActor) {
  const collection = db.collection('user_safety_settings');
  const [direct, owned] = await Promise.all([tx.get(collection.doc(actor.profileId)), tx.get(collection.where('user_id', 'in', [...new Set([actor.uid, actor.profileId])]).limit(3))]);
  const docs = new Map<string, DocumentSnapshot>(owned.docs.map(doc => [doc.id, doc])); if (direct.exists) docs.set(direct.id, direct);
  if (docs.size > 1) throw review();
  const snapshot = [...docs.values()][0], row = snapshot?.data();
  if (row && (row.user_id !== actor.profileId || row.id !== undefined && row.id !== snapshot.id)) throw review();
  if (row && ['authority_version', 'owner_uid', 'auth_created_at_ms', 'binding_revision'].some(key => Object.hasOwn(row, key))
    && (row.authority_version !== 1 || row.owner_uid !== actor.uid || row.auth_created_at_ms !== actor.created || row.binding_revision !== actor.bindingRevision)) throw review();
  return { ref: snapshot ? collection.doc(snapshot.id) : collection.doc(actor.profileId), row };
}
export function safetyPatch(actor: ParentalActor, row: Row | undefined, updates: Row, now: string) {
  return { ...safetyDefaults, ...row, ...updates, user_id: actor.profileId, authority_version: 1, owner_uid: actor.uid,
    auth_created_at_ms: actor.created, binding_revision: actor.bindingRevision, created_at: row?.created_at ?? now, updated_at: now };
}
export function safeSafety(row: Row, id: string) {
  return Object.fromEntries(['user_id', 'created_at', 'updated_at', ...Object.keys(safetyDefaults)].filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]).concat([['id', id]]));
}
export function relatedSafetyUpdates(parental: Row, firstSetup = false): Row {
  const result: Row = parental.is_active === true || firstSetup ? { ...childSafetyDefaults } : {};
  if (Object.hasOwn(parental, 'content_filter_level')) result.content_filter_level = parental.content_filter_level === 'unrestricted' ? 'minimal' : parental.content_filter_level;
  return result;
}
