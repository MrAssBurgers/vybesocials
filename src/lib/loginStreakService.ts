import { getFirebaseAuth } from './firebase/authService';
import { invokeFunction } from './firebase/functionsService';
import { profileAccountGuard } from './profileAccountGuard';

export type StreakAction = 'read' | 'track' | 'restore';
export type StreakActor = { uid: string; profileId: string };
export interface LoginStreakReceipt {
  ok: true; ownerUid: string; profileId: string; accountCreatedAt: number;
  action: StreakAction; requestId: string | null; serverTime: number; revision: string | null;
  timezone: string; timezoneChanged: boolean; currentDay: string;
  streak: number; longestStreak: number; currentStreakVerified: boolean; needsLoginToday: boolean;
  expiresAt: string | null; isNewDay: boolean; streakExtended: boolean; streakBroken: boolean;
  restored: boolean; replayed: boolean;
  legacyHistory: { status: 'none' | 'preserved' | 'ambiguous' | 'invalid'; currentStreak: number | null; longestStreak: number | null; lastLoginDate: string | null };
  restore: { eligible: boolean; previousStreak: number | null; availableUntil: string | null; access: 'launch-free' | 'premium' | 'none'; reason: 'available' | 'premium-required' | 'no-break' | 'expired' | 'legacy-unverified' | 'missed-multiple-days' };
}
type Request = { action: StreakAction; expectedOwnerUid: string; expectedProfileId: string; expectedAccountCreatedAt: number; timezone: string; requestId?: string; expectedRevision?: string };
const STORAGE = 'vybe:login-streak-attempts:v1';
const attempts = new Map<string, Request>();
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const revision = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const timestamp = (v: unknown) => v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const validId = (v: unknown): v is string => typeof v === 'string' && !!v && v.length <= 128 && !v.includes('/');
function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}
function persist() {
  while (attempts.size > 32) attempts.delete(attempts.keys().next().value!);
  try { sessionStorage.setItem(STORAGE, JSON.stringify([...attempts])); } catch { /* Same-tab memory still retains uncertain requests. */ }
}
function retained(input: Request) {
  if (!attempts.size) try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(stored)) for (const entry of stored.slice(-32)) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue;
      const row = entry[1] as Request;
      if (row && ['track', 'restore'].includes(row.action) && validId(row.expectedOwnerUid) && validId(row.expectedProfileId) && count(row.expectedAccountCreatedAt) && validTimezone(row.timezone) && uuid.test(row.requestId || '') && (row.action !== 'restore' || revision(row.expectedRevision))) attempts.set(entry[0], row);
    }
  } catch { /* Local recovery data never establishes authority. */ }
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone }).format();
  const key = JSON.stringify([input.expectedOwnerUid, input.expectedProfileId, input.expectedAccountCreatedAt, input.action, input.timezone, input.expectedRevision ?? localDay]);
  const previous = attempts.get(key);
  const request = previous && previous.expectedOwnerUid === input.expectedOwnerUid && previous.expectedProfileId === input.expectedProfileId && previous.expectedAccountCreatedAt === input.expectedAccountCreatedAt && previous.action === input.action && previous.timezone === input.timezone && previous.expectedRevision === input.expectedRevision ? previous : { ...input, requestId: crypto.randomUUID() };
  attempts.set(key, request); persist(); return { key, request };
}
function checked(value: unknown, input: Request): LoginStreakReceipt {
  const row = value as LoginStreakReceipt | null;
  const legacy = row?.legacyHistory, restore = row?.restore;
  if (!row || row.ok !== true || row.ownerUid !== input.expectedOwnerUid || row.profileId !== input.expectedProfileId || row.accountCreatedAt !== input.expectedAccountCreatedAt || row.action !== input.action || row.requestId !== (input.requestId ?? null) || !count(row.serverTime) || !(row.revision === null || revision(row.revision)) || !validTimezone(row.timezone) || !day(row.currentDay) || !count(row.streak) || !count(row.longestStreak) || row.longestStreak < row.streak || !timestamp(row.expiresAt) || ['timezoneChanged', 'currentStreakVerified', 'needsLoginToday', 'isNewDay', 'streakExtended', 'streakBroken', 'restored', 'replayed'].some(key => typeof row[key as keyof LoginStreakReceipt] !== 'boolean') || !legacy || !['none', 'preserved', 'ambiguous', 'invalid'].includes(legacy.status) || !(legacy.currentStreak === null || count(legacy.currentStreak)) || !(legacy.longestStreak === null || count(legacy.longestStreak)) || !(legacy.lastLoginDate === null || day(legacy.lastLoginDate)) || !restore || typeof restore.eligible !== 'boolean' || !(restore.previousStreak === null || count(restore.previousStreak)) || !timestamp(restore.availableUntil) || !['launch-free', 'premium', 'none'].includes(restore.access) || !['available', 'premium-required', 'no-break', 'expired', 'legacy-unverified', 'missed-multiple-days'].includes(restore.reason) || (restore.eligible && (!revision(row.revision) || !restore.previousStreak || !restore.availableUntil || restore.access === 'none' || restore.reason !== 'available')) || (input.action === 'restore' && (!row.restored || row.revision === null)) || (input.action === 'track' && row.revision === null)) throw new Error('Your streak confirmation was incomplete. Please retry.');
  return row;
}

/** Capture the caller before lazy-loading this module. Unknown outcomes retain their exact request. */
export async function manageLoginStreak(actor: StreakActor, action: StreakAction, options: { timezone?: string; expectedRevision?: string } = {}, extraGuard?: () => void): Promise<LoginStreakReceipt> {
  const guard = profileAccountGuard(actor.uid, extraGuard);
  const user = getFirebaseAuth()?.currentUser;
  const createdAt = Date.parse(user?.metadata.creationTime || '');
  if (!user || user.uid !== actor.uid || !validId(actor.profileId) || !count(createdAt) || createdAt <= 0) throw new Error('Sign in again to confirm your streak.');
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!validTimezone(timezone) || (action === 'restore' && !revision(options.expectedRevision))) throw new Error('Refresh your streak before restoring it.');
  const input: Request = { action, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: createdAt, timezone, ...(action === 'restore' ? { expectedRevision: options.expectedRevision } : {}) };
  const attempt = action === 'read' ? null : retained(input);
  const request = attempt?.request ?? input;
  let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { guard(); if (!active || getFirebaseAuth()?.currentUser !== user) throw new Error('This streak request has ended. Retry from your current account.'); };
  try {
    current();
    const { data, error } = await Promise.race([
      invokeFunction<unknown>('manageLoginStreak', request),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Your streak took too long to confirm. Please retry.')); }, 15_000); }),
    ]);
    current();
    if (error) {
      // A confirmed stale revision/day cannot succeed on replay. Unknown outcomes retain the request.
      if (attempt && ['aborted', 'invalid-argument', 'failed-precondition'].includes(String(error.name || '').replace(/^functions\//, ''))) { attempts.delete(attempt.key); persist(); }
      throw error;
    }
    const result = checked(data, request);
    if (attempt) { attempts.delete(attempt.key); persist(); }
    return result;
  } finally { active = false; if (timer) clearTimeout(timer); }
}
