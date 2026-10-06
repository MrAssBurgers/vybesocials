import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, auth, requireAuth } from './_shared/admin.js';

import { parentalScopeFields, parentalRequestIdentity, checkParentalAuth, resolveParentalActor, parentalBinding, readParentalRow } from './_shared/parentalAccountAuthority.js';

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,8}$/.test(pin);
const lockWindow = 5 * 60 * 1000;
const fields = new Set(['is_active', 'content_filter_level', 'max_screen_time_minutes', 'allowed_features']);

function settings(raw: unknown): Row {
  if (!object(raw) || Object.keys(raw).some(key => !fields.has(key))
    || (raw.is_active !== undefined && typeof raw.is_active !== 'boolean')
    || (raw.content_filter_level !== undefined && (typeof raw.content_filter_level !== 'string' || !['protected', 'moderate', 'unrestricted'].includes(raw.content_filter_level)))
    || (raw.max_screen_time_minutes !== undefined && raw.max_screen_time_minutes !== null
      && (!Number.isInteger(raw.max_screen_time_minutes) || Number(raw.max_screen_time_minutes) < 1 || Number(raw.max_screen_time_minutes) > 1440))
    || (raw.allowed_features !== undefined && raw.allowed_features !== null
      && (!Array.isArray(raw.allowed_features) || raw.allowed_features.length > 32
        || raw.allowed_features.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(value))))) {
    throw new HttpsError('invalid-argument', 'Use valid parental-control settings.');
  }
  return raw;
}

function owned(row: Row | undefined, uid: string) {
  if (row && row.user_id !== uid) throw new HttpsError('failed-precondition', 'These controls need an ownership review. Nothing was changed.');
}
function material(row: Row) {
  if (typeof row.pin_salt !== 'string' || !/^[a-f0-9]{32,64}$/.test(row.pin_salt)
    || typeof row.pin_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.pin_hash)
    || ![undefined, 'sha256-v1', 'scrypt-v2'].includes(row.pin_algo as string | undefined)) {
    throw new HttpsError('failed-precondition', 'These controls need a PIN recovery review. Nothing was changed.');
  }
  return { salt: row.pin_salt, hash: row.pin_hash, algorithm: row.pin_algo };
}
function matches(row: Row, pin: unknown) {
  const stored = material(row);
  if (!validPin(pin)) return false;
  const candidate = stored.algorithm === 'scrypt-v2'
    ? scryptSync(pin, stored.salt, 32, { N: 16384, r: 8, p: 1 })
    : createHash('sha256').update(`${stored.salt}:${pin}`).digest();
  return timingSafeEqual(candidate, Buffer.from(stored.hash, 'hex'));
}
function safe(row: Row) {
  return { user_id: row.user_id, is_active: row.is_active, content_filter_level: row.content_filter_level,
    max_screen_time_minutes: row.max_screen_time_minutes, allowed_features: row.allowed_features,
    created_at: row.created_at, updated_at: row.updated_at, has_pin: Boolean(row.pin_hash) };
}

type Check = { ok: boolean; limited: boolean; patch: Row };
function check(row: Row, pin: unknown, now: number): Check {
  const failures = row.pin_failures ?? 0, until = row.pin_lock_until ?? 0;
  if (!Number.isSafeInteger(failures) || Number(failures) < 0 || Number(failures) > 5
    || !Number.isSafeInteger(until) || Number(until) < 0) throw new HttpsError('failed-precondition', 'PIN attempts need a recovery review.');
  if (Number(until) > now) return { ok: false, limited: true, patch: {} };
  if (matches(row, pin)) return { ok: true, limited: false, patch: { pin_failures: 0, pin_lock_until: 0 } };
  const next = (Number(until) > 0 ? 0 : Number(failures)) + 1;
  return { ok: false, limited: false, patch: { pin_failures: next, pin_lock_until: next >= 5 ? now + lockWindow : 0 } };
}
function fail(result: { limited?: boolean; denied?: boolean }) {
  if (result.limited) throw new HttpsError('resource-exhausted', 'Too many PIN attempts. Wait five minutes and try again.');
  if (result.denied) throw new HttpsError('permission-denied', 'Enter the current parental PIN to make changes.');
}

export const setParentalPin = onCall(async request => {
  const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
  const identity = parentalRequestIdentity(request, raw);
  await checkParentalAuth(auth, identity);
  if (!validPin(raw.pin)) throw new HttpsError('invalid-argument', 'PIN must be 4–8 digits.');
  if (Object.keys(raw).some(key => !['pin', 'currentPin', 'settings', ...parentalScopeFields].includes(key))) throw new HttpsError('invalid-argument', 'Invalid PIN setup details.');
  const input = raw.settings === undefined ? {} : settings(raw.settings);
  let nextMaterial: { salt: string; hash: string } | undefined;
  const ref = db.collection('parental_controls').doc(uid);
  const result = await db.runTransaction(async tx => {
    const actor = await resolveParentalActor(db, tx, identity);
    const prev = await readParentalRow(db, tx, actor); owned(prev, uid);
    await checkParentalAuth(auth, identity);
    const now = Date.now();
    if (prev) {
      const proof = check(prev, raw.currentPin, now);
      if (proof.limited) return { limited: true };
      if (!proof.ok) { tx.set(ref, proof.patch, { merge: true }); return { denied: true }; }
    }
    if (!nextMaterial) {
      const salt = randomBytes(16).toString('hex');
      nextMaterial = { salt, hash: scryptSync(raw.pin as string, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex') };
    }
    const time = new Date(now).toISOString();
    const merged = { ...(prev ?? {}), ...parentalBinding(actor), user_id: uid, is_active: prev?.is_active ?? true,
      content_filter_level: prev?.content_filter_level ?? 'protected',
      max_screen_time_minutes: prev && Object.hasOwn(prev, 'max_screen_time_minutes') ? prev.max_screen_time_minutes : 120,
      allowed_features: prev && Object.hasOwn(prev, 'allowed_features') ? prev.allowed_features : ['messaging', 'feed', 'profile'], ...input,
      pin_hash: nextMaterial.hash, pin_salt: nextMaterial.salt, pin_algo: 'scrypt-v2', pin_failures: 0, pin_lock_until: 0,
      created_at: prev?.created_at ?? time, updated_at: time };
    tx.set(ref, merged); return { controls: safe(merged) };
  });
  fail(result); return { ok: true, controls: 'controls' in result ? result.controls : undefined };
});

export const verifyParentalPin = onCall(async request => {
  const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
  const identity = parentalRequestIdentity(request, raw);
  await checkParentalAuth(auth, identity);
  if (Object.keys(raw).some(key => !['pin', ...parentalScopeFields].includes(key))) throw new HttpsError('invalid-argument', 'Invalid PIN verification details.');
  const ref = db.collection('parental_controls').doc(uid);
  const result = await db.runTransaction(async tx => {
    const actor = await resolveParentalActor(db, tx, identity);
    const row = await readParentalRow(db, tx, actor); owned(row, uid);
    await checkParentalAuth(auth, identity);
    if (!row) return { ok: false, limited: false };
    const proof = check(row, raw.pin, Date.now());
    if (!proof.limited) tx.set(ref, proof.patch, { merge: true });
    return { ok: proof.ok, limited: proof.limited };
  });
  fail(result); return { ok: result.ok };
});

export const getParentalControlsSafe = onCall(async request => {
  const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
  const identity = parentalRequestIdentity(request, raw);
  if (Object.keys(raw).some(key => !parentalScopeFields.includes(key))) throw new HttpsError('invalid-argument', 'Invalid parental-control read details.');
  await checkParentalAuth(auth, identity);
  return db.runTransaction(async tx => {
    const actor = await resolveParentalActor(db, tx, identity);
    const row = await readParentalRow(db, tx, actor);
    owned(row, uid); await checkParentalAuth(auth, identity);
    return { controls: row ? safe(row) : null };
  });
});

export const updateParentalControls = onCall(async request => {
  const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
  const identity = parentalRequestIdentity(request, raw);
  await checkParentalAuth(auth, identity);
  if (Object.keys(raw).some(key => !['pin', 'updates', ...parentalScopeFields].includes(key))) throw new HttpsError('invalid-argument', 'Invalid control update details.');
  const input = settings(raw.updates);
  const ref = db.collection('parental_controls').doc(uid);
  const result = await db.runTransaction(async tx => {
    const actor = await resolveParentalActor(db, tx, identity);
    const row = await readParentalRow(db, tx, actor); owned(row, uid);
    await checkParentalAuth(auth, identity);
    if (!row) throw new HttpsError('failed-precondition', 'Set up parental controls first.');
    const proof = check(row, raw.pin, Date.now());
    if (proof.limited) return { limited: true };
    if (!proof.ok) { tx.set(ref, proof.patch, { merge: true }); return { denied: true }; }
    tx.set(ref, { ...input, ...proof.patch, updated_at: new Date().toISOString() }, { merge: true });
    return {};
  });
  fail(result); return { ok: true };
});
