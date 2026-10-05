import { getFirebaseAuth } from '@/lib/firebase/authService';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';

export type MapWaveActor = { uid: string; profileId: string };
export type MapWaveTarget = { targetProfileId: string; expectedAccessRevision: string };
export type MapWaveReceipt = { notificationId: string; replayed: boolean; cooldownUntil: number; acknowledge: () => void };
export class MapWaveCooldownError extends Error {
  constructor(public readonly cooldownUntil: number) { super('Please wait before waving to this friend again.'); }
}
const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/') && value !== '.' && value !== '..';
const stamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const revision = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const notification = (value: unknown): value is string => typeof value === 'string' && /^map-wave-[a-f0-9]{64}$/.test(value);
const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const STORAGE = 'vybe:map-wave-attempts:v1';
const attempts = new Map<string, string>();
function stored(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '{}');
    return obj(parsed) ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) => hash(key) && uuid(value)).slice(-32)) as Record<string, string> : {};
  } catch { return {}; }
}
function save(value: Record<string, string>) {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(value).slice(-32)))); } catch { /* Memory retains an uncertain attempt when browser storage is unavailable. */ }
}
async function retain(body: object, guard: () => void) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body))); guard();
  const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const rows = stored(), requestId = attempts.get(key) || rows[key] || crypto.randomUUID();
  attempts.set(key, requestId); rows[key] = requestId; save(rows);
  while (attempts.size > 32) attempts.delete(attempts.keys().next().value!);
  return { requestId, complete() {
    if (attempts.get(key) === requestId) attempts.delete(key);
    const rows = stored(); if (rows[key] === requestId) delete rows[key]; save(rows);
  } };
}

/** No coordinates or names are sent. Only a hash and exact retry UUID enter session storage. */
export async function sendCheckedMapWave(actor: MapWaveActor, target: MapWaveTarget, extraGuard: () => void): Promise<MapWaveReceipt> {
  const accountGuard = profileAccountGuard(actor.uid, extraGuard);
  const user = getFirebaseAuth()?.currentUser, createdAt = Date.parse(user?.metadata.creationTime || '');
  if (!user || user.uid !== actor.uid || !id(actor.profileId) || !stamp(createdAt) || !id(target.targetProfileId) || target.targetProfileId === actor.profileId || !revision(target.expectedAccessRevision)) throw new Error('Refresh this friend before sending a wave.');
  const body = { action: 'send', expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: createdAt, targetProfileId: target.targetProfileId, expectedAccessRevision: target.expectedAccessRevision };
  let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { accountGuard(); if (!active || getFirebaseAuth()?.currentUser !== user) throw new Error('This wave request has ended. Please retry.'); };
  const invalid = () => new Error('The wave could not be confirmed. Please retry.');
  try {
    current();
    return await Promise.race([
      (async () => {
        const retained = await retain(body, current); current();
        const started = performance.now();
        const result = await invokeFunction<unknown>('manageMapWave', { ...body, requestId: retained.requestId }); current();
        const elapsed = Math.max(0, performance.now() - started);
        if (result.error) {
          const code = String(result.error.code || result.error.name || '').replace(/^functions\//, '');
          const details = result.error.details;
          if (['invalid-argument', 'aborted', 'failed-precondition'].includes(code)) retained.complete();
          if (code === 'resource-exhausted' && obj(details) && stamp(details.serverTime) && stamp(details.cooldownUntil) && details.cooldownUntil > details.serverTime && details.cooldownUntil <= details.serverTime + 60_000) {
            // The transaction checked this exact receipt before rejecting a new send.
            // A generic outer rate-limit rejection cannot establish that fact.
            retained.complete();
            throw new MapWaveCooldownError(Date.now() + Math.max(0, details.cooldownUntil - details.serverTime - elapsed));
          }
          throw Object.assign(new Error(result.error.message || 'The wave could not be sent. Please retry.'), { code });
        }
        const row = result.data;
        if (!obj(row) || row.ok !== true || row.action !== 'send' || row.status !== 'sent' || row.ownerUid !== body.expectedOwnerUid || row.profileId !== body.expectedProfileId || row.accountCreatedAt !== createdAt || row.targetProfileId !== body.targetProfileId || row.accessRevision !== body.expectedAccessRevision || row.requestId !== retained.requestId || !notification(row.notificationId) || typeof row.replayed !== 'boolean' || !stamp(row.serverTime) || !stamp(row.sentAt) || row.sentAt > row.serverTime || !stamp(row.cooldownUntil) || row.cooldownUntil !== row.sentAt + 60_000 || !stamp(row.validUntil) || row.validUntil <= row.serverTime || row.validUntil > row.serverTime + 15_000) throw invalid();
        const validUntil = Date.now() + Math.max(0, row.validUntil - row.serverTime - elapsed);
        if (validUntil <= Date.now()) throw new Error('Wave access expired while checking. Please retry.');
        const acknowledge = () => {
          accountGuard();
          if (getFirebaseAuth()?.currentUser !== user || validUntil <= Date.now()) throw new Error('Refresh this friend to confirm the wave.');
          retained.complete();
        };
        return { notificationId: row.notificationId, replayed: row.replayed, cooldownUntil: Date.now() + Math.max(0, row.cooldownUntil - row.serverTime - elapsed), acknowledge };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Sending the wave took too long. Please retry.')); }, 15_000); }),
    ]);
  } finally { active = false; if (timer) clearTimeout(timer); }
}
