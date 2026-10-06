import { invokeFunction } from '@/lib/firebase/functionsService';
import type { ActivityType } from '@/lib/vybemap/types';

export type LocationActor = { uid: string; profileId: string };
export type LocationDuration = 'once' | '1h' | 'until_tonight' | '24h' | 'while_using' | 'indefinite' | 'custom';
export type LocationPrecision = 'approximate' | 'precise';
export type LocationSharingState = { revision: string | null; enabled: boolean; updatedAt: string | null };
export type LocationPeer = { id: string; username: string; displayName: string | null; avatarUrl: string | null };
export type LocationShare = { id: string; revision: string; sharerId: string; viewerId: string; precision: LocationPrecision; duration: LocationDuration; active: boolean; paused: boolean; expiresAt: string; createdAt: string; updatedAt: string };
export type LocationRequest = { id: string; revision: string; requesterId: string; targetId: string; requester: LocationPeer; target: LocationPeer; precision: LocationPrecision; duration: LocationDuration; customMinutes: number | null; message: string | null; status: 'pending' | 'accepted' | 'declined' | 'blocked' | 'expired'; expiresAt: string; createdAt: string; updatedAt: string; shareId: string | null };
export type SharedLocation = { id: string; shareId: string; latitude: number; longitude: number; accuracy: number | null; speed: number | null; heading: number | null; batteryPercent: number | null; activityType: ActivityType; precision: LocationPrecision; approxRadiusM: number; updatedAt: string; expiresAt: string; profile: Omit<LocationPeer, 'id'> };
export type LocationRead = { state: LocationSharingState; shares: LocationShare[]; requests: LocationRequest[]; locations: SharedLocation[]; targetId: string | null; leaseUntil: number; serverTime: number; legacySharingNeedsReview: boolean };
export type LocationMutation =
  | { action: 'request'; targetId: string; duration: LocationDuration; precision: LocationPrecision; message: string | null; customMinutes?: number }
  | { action: 'respond'; locationRequestId: string; expectedRevision: string; intent: 'accept' | 'decline' | 'block' }
  | { action: 'pause'; shareId: string; expectedRevision: string; paused: boolean }
  | { action: 'stop'; shareId: string; expectedRevision: string }
  | { action: 'setSharing'; expectedRevision: string | null; enabled: boolean }
  | { action: 'publishPosition'; sharingRevision: string; sampledAt: number; latitude: number; longitude: number; accuracy: number | null; speed: number | null; heading: number | null; batteryPercent: number | null; activityType: ActivityType };
export type LocationReceipt = { state?: LocationSharingState; share?: LocationShare | null; request?: LocationRequest; sharingRevision?: string; sampledAt?: number; expiresAt?: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 128): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const id = (v: unknown): v is string => text(v) && !v.includes('/');
const hash = (v: unknown, n: number): v is string => typeof v === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(v);
const time = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const precision = (v: unknown) => v === 'precise' || v === 'approximate';
const duration = (v: unknown) => ['once', '1h', 'until_tonight', '24h', 'while_using', 'indefinite', 'custom'].includes(String(v));
const failure = () => new Error('Location sharing was not confirmed. Please retry.');
function state(v: unknown): v is LocationSharingState {
  return object(v) && typeof v.enabled === 'boolean' && (v.revision === null
    ? v.enabled === false && v.updatedAt === null
    : hash(v.revision, 48) && time(v.updatedAt));
}
function peer(v: unknown, expectedId: unknown) { return object(v) && v.id === expectedId && typeof v.username === 'string' && v.username.length <= 128 && nullable(v.displayName, x => typeof x === 'string' && x.length <= 200) && nullable(v.avatarUrl, x => typeof x === 'string' && x.length <= 8192); }
function share(v: unknown, actor: LocationActor): v is LocationShare {
  return object(v) && hash(v.id, 64) && hash(v.revision, 48) && id(v.sharerId) && id(v.viewerId) && v.sharerId !== v.viewerId && [v.sharerId, v.viewerId].includes(actor.profileId) && precision(v.precision) && duration(v.duration) && typeof v.active === 'boolean' && typeof v.paused === 'boolean' && time(v.expiresAt) && time(v.createdAt) && time(v.updatedAt);
}
function request(v: unknown, actor: LocationActor): v is LocationRequest {
  return object(v) && hash(v.id, 64) && hash(v.revision, 48) && id(v.requesterId) && id(v.targetId) && v.requesterId !== v.targetId && [v.requesterId, v.targetId].includes(actor.profileId) && peer(v.requester, v.requesterId) && peer(v.target, v.targetId) && precision(v.precision) && duration(v.duration) && nullable(v.customMinutes, x => number(x, 5, 1440)) && nullable(v.message, x => typeof x === 'string' && x.length <= 500) && ['pending', 'accepted', 'declined', 'blocked', 'expired'].includes(String(v.status)) && time(v.expiresAt) && time(v.createdAt) && time(v.updatedAt) && nullable(v.shareId, x => hash(x, 64));
}
export function checkedLocationRead(value: unknown, actor: LocationActor, targetId?: string): LocationRead {
  if (!object(value) || value.targetId !== (targetId || null) || !state(value.state) || typeof value.legacySharingNeedsReview !== 'boolean' || !number(value.serverTime, 0, Number.MAX_SAFE_INTEGER) || !number(value.leaseUntil, value.serverTime, value.serverTime + 60_000) || !Array.isArray(value.shares) || value.shares.length > 500 || !value.shares.every(v => share(v, actor)) || !Array.isArray(value.requests) || value.requests.length > 500 || !value.requests.every(v => request(v, actor)) || !Array.isArray(value.locations) || value.locations.length > 500) throw failure();
  if (targetId && (value.shares.some(v => ![v.sharerId, v.viewerId].includes(targetId)) || value.requests.some(v => ![v.requesterId, v.targetId].includes(targetId)))) throw failure();
  const shares = value.shares as LocationShare[];
  for (const item of value.locations) {
    if (!object(item)) throw failure();
    const grant = shares.find(s => s.id === item.shareId && s.viewerId === actor.profileId && s.sharerId === item.id && s.active && !s.paused && Date.parse(s.expiresAt) > Number(value.serverTime));
    if (!grant || item.precision !== grant.precision || !number(item.latitude, -90, 90) || !number(item.longitude, -180, 180) || !nullable(item.accuracy, x => number(x, 0, 100_000)) || !nullable(item.speed, x => number(x, 0, 2000)) || !nullable(item.heading, x => number(x, 0, 360)) || !nullable(item.batteryPercent, x => number(x, 0, 100)) || !['stationary', 'walking', 'running', 'driving', 'cycling', 'flying', 'traveling'].includes(String(item.activityType)) || !number(item.approxRadiusM, 0, 100_000) || !time(item.updatedAt) || !time(item.expiresAt) || Date.parse(item.expiresAt) > Date.parse(grant.expiresAt) || !object(item.profile) || !peer({ ...item.profile, id: item.id }, item.id)) throw failure();
    if (('id' in item.profile && item.profile.id !== item.id) || (item.precision === 'approximate' && (item.speed !== null || item.heading !== null || Number(item.approxRadiusM) < 1000))) throw failure();
  }
  return value as unknown as LocationRead;
}
export async function locationSharingRequest(actor: LocationActor, input: { action: 'read'; targetId?: string } | (LocationMutation & { requestId: string }), guard: () => void): Promise<LocationRead | LocationReceipt> {
  guard();
  if (!id(actor.uid) || !id(actor.profileId)) throw failure();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const transport = invokeFunction<unknown>('manage-location-sharing', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  // A mobile transport may hang through a connectivity change. Retire its reply
  // rather than leaving controls spinning for the SDK's full transport timeout.
  // Mutation attempts retain their identity, so an uncertain save is retryable.
  const result = await Promise.race([transport, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Location sharing took too long. Check your connection and retry.'), { code: 'deadline-exceeded' })), input.action === 'read' ? 15_000 : 20_000);
  })]).finally(() => clearTimeout(timer));
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Location sharing is unavailable. Please retry.'), { code: result.error.code || result.error.name });
  const v = result.data;
  if (!object(v) || v.ok !== true || v.ownerUid !== actor.uid || v.profileId !== actor.profileId || v.action !== input.action || v.requestId !== (input.action === 'read' ? null : input.requestId) || !number(v.serverTime, 0, Number.MAX_SAFE_INTEGER)) throw failure();
  if (input.action === 'read') return checkedLocationRead(v, actor, input.targetId);
  if (input.action === 'setSharing' && (!state(v.state) || v.state.enabled !== input.enabled)) throw failure();
  if (input.action === 'request' && (!request(v.request, actor) || v.request.status !== 'pending' || v.request.shareId !== null || v.request.requesterId !== actor.profileId || v.request.targetId !== input.targetId || v.request.precision !== input.precision || v.request.duration !== input.duration || v.request.message !== input.message || v.request.customMinutes !== (input.customMinutes ?? null))) throw failure();
  if (input.action === 'respond') {
    if (!request(v.request, actor) || v.request.targetId !== actor.profileId || v.request.id !== input.locationRequestId || v.request.status !== ({ accept: 'accepted', decline: 'declined', block: 'blocked' }[input.intent])) throw failure();
    if (input.intent === 'accept') {
      if (!share(v.share, actor) || v.share.id !== v.request.shareId || v.share.sharerId !== actor.profileId || v.share.viewerId !== v.request.requesterId || v.share.precision !== v.request.precision || v.share.duration !== v.request.duration || !v.share.active || v.share.paused) throw failure();
    } else if (v.share !== null) throw failure();
  }
  if ((input.action === 'pause' || input.action === 'stop') && (!share(v.share, actor) || v.share.id !== input.shareId || (input.action === 'pause' ? v.share.paused !== input.paused : v.share.active !== false))) throw failure();
  if (input.action === 'publishPosition' && (v.sharingRevision !== input.sharingRevision || v.sampledAt !== input.sampledAt || !time(v.expiresAt))) throw failure();
  return v as LocationReceipt;
}

const STORAGE = 'vybe-location-attempts-v1';
const attempts = new Map<string, LocationMutation & { requestId: string }>();
function stored(): Record<string, LocationMutation & { requestId: string }> {
  try { const v: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '{}'); return object(v) ? Object.fromEntries(Object.entries(v).filter(([key, body]) => key.length < 2000 && object(body) && body.action !== 'publishPosition' && typeof body.requestId === 'string' && /^[a-f0-9-]{36}$/.test(body.requestId)).slice(-32)) as ReturnType<typeof stored> : {}; } catch { return {}; }
}
/** Coordinates never enter retry storage. Non-coordinate retries preserve the
 * original revision as well as request identity across a lost reply/reload. */
export function locationAttempt(actor: LocationActor, input: LocationMutation) {
  const { expectedRevision: _revision, ...intent } = input as LocationMutation & { expectedRevision?: string | null };
  const key = JSON.stringify([actor.uid, actor.profileId, intent]);
  const values = stored();
  const body = input.action === 'publishPosition' ? { ...input, requestId: crypto.randomUUID() } : attempts.get(key) || values[key] || { ...input, requestId: crypto.randomUUID() };
  if (input.action !== 'publishPosition') {
    attempts.set(key, body); values[key] = body;
    while (attempts.size > 32) attempts.delete(attempts.keys().next().value!);
    try { sessionStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-32)))); } catch { /* In-memory recovery remains. */ }
  }
  return { body, complete() { attempts.delete(key); const current = stored(); delete current[key]; try { sessionStorage.setItem(STORAGE, JSON.stringify(current)); } catch { /* Restricted storage. */ } } };
}
