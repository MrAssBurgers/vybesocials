import { invokeFunction } from '@/lib/firebase/functionsService';
import type { MapPlace, MapMeetup, MapPlacePost, MapPlacePostComment, FriendCheckIn } from './types';

export type MapActor = { uid: string; profileId: string };
export type MapScope = 'places' | 'meetups' | 'checkIns' | 'placePosts' | 'comments';
export type MapRows = { places: MapPlace; meetups: MapMeetup; checkIns: FriendCheckIn; placePosts: MapPlacePost; comments: MapPlacePostComment };
export type MapItem = MapRows[MapScope];
export type MapMutation =
  | { action: 'createPlace'; name: string; category: string; description?: string; photoUrl?: string; latitude: number; longitude: number }
  | { action: 'checkIn'; placeId: string; message?: string }
  | { action: 'createPlacePost'; placeId: string; content: string }
  | { action: 'createComment'; postId: string; content: string }
  | { action: 'createMeetup'; title: string; description?: string; latitude: number; longitude: number; destLabel?: string }
  | { action: 'joinMeetup' | 'leaveMeetup'; meetupId: string; expectedRevision: string | null }
  | { action: 'publishPlace' | 'publishMeetup'; targetId: string; expectedRevision: string };
export type MapRead = { action: 'list'; scope: MapScope; targetId?: string; cursor?: string } | { action: 'read'; kind: 'place' | 'meetup'; targetId: string };
export type MapPage<T = MapItem> = { items: T[]; nextCursor: string | null; serverTime: number; validUntil: number };
export type MapReceipt = { resourceId: string; status: 'active' | 'going' | 'left' | 'unavailable'; item: MapItem | null; serverTime: number; validUntil: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512 && !v.includes('/');
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const revision = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v);
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableText = (v: unknown) => v == null || typeof v === 'string';
const failure = () => new Error('The map update could not be confirmed. Please retry.');
const coordinates = (row: Record<string, unknown>, lat = 'latitude', lng = 'longitude') => finite(row[lat], -90, 90) && finite(row[lng], -180, 180);
export function validMapItem(v: unknown, scope: MapScope, targetId?: string): v is MapItem {
  if (!object(v) || !id(v.id)) return false;
  if (scope === 'places') return id(v.created_by) && typeof v.name === 'string' && typeof v.category === 'string' && coordinates(v) && count(v.check_in_count) && typeof v.legacy === 'boolean' && revision(v.revision);
  if (scope === 'meetups') return id(v.host_id) && typeof v.title === 'string' && coordinates(v, 'dest_latitude', 'dest_longitude') && date(v.starts_at) && count(v.member_count) && typeof v.legacy === 'boolean' && revision(v.revision) && (v.membership === null || (object(v.membership) && ['going', 'left'].includes(String(v.membership.status)) && revision(v.membership.revision)));
  if (!id(v.user_id) || !date(v.created_at)) return false;
  if (v.profile !== null && v.profile !== undefined && (!object(v.profile) || !nullableText(v.profile.username) || !nullableText(v.profile.display_name) || !nullableText(v.profile.avatar_url))) return false;
  if (scope === 'checkIns') return coordinates(v) && id(v.place_id) && nullableText(v.message);
  if (typeof v.content !== 'string') return false;
  if (scope === 'placePosts') return id(v.place_id) && (!targetId || v.place_id === targetId) && count(v.comment_count);
  return id(v.post_id) && (!targetId || v.post_id === targetId);
}

export async function mapSocialRequest(actor: MapActor, input: MapRead | (MapMutation & { requestId: string }), guard: () => void): Promise<MapPage | MapReceipt | { item: MapPlace | MapMeetup | null; serverTime: number; validUntil: number }> {
  guard();
  const started = performance.now();
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      invokeFunction<unknown>('manage-map-social', { ...input, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('The map request took too long. Please retry.')); }, 15_000); }),
    ]);
    guard(); if (!active) throw failure();
    if (result.error) throw Object.assign(new Error(result.error.message || 'Map content is unavailable. Please retry.'), { code: result.error.code || result.error.name });
    const v = result.data;
    if (!object(v) || v.ok !== true || v.ownerUid !== actor.uid || v.profileId !== actor.profileId || v.action !== input.action || !finite(v.serverTime, 0, Number.MAX_SAFE_INTEGER) || !finite(v.validUntil, v.serverTime, v.serverTime + 30_000)) throw failure();
    const validUntil = Date.now() + Math.max(0, v.validUntil - v.serverTime - (performance.now() - started));
    if (input.action === 'list') {
      if (v.scope !== input.scope || v.targetId !== (input.targetId || null) || !Array.isArray(v.items) || v.items.length > 100 || !v.items.every(row => validMapItem(row, input.scope, input.targetId)) || !(v.nextCursor === null || (typeof v.nextCursor === 'string' && v.nextCursor.length > 0 && v.nextCursor.length <= 4096 && v.nextCursor !== input.cursor))) throw failure();
      return { ...v, validUntil } as MapPage;
    }
    if (input.action === 'read') {
      if (v.kind !== input.kind || v.targetId !== input.targetId || (v.item !== null && (!validMapItem(v.item, input.kind === 'place' ? 'places' : 'meetups') || v.item.id !== input.targetId))) throw failure();
      return { ...v, validUntil } as { item: MapPlace | MapMeetup | null; serverTime: number; validUntil: number };
    }
    if (v.requestId !== input.requestId || !id(v.resourceId) || !['active', 'going', 'left', 'unavailable'].includes(String(v.status))) throw failure();
    const scope = input.action === 'createPlace' || input.action === 'publishPlace' ? 'places' : input.action === 'checkIn' ? 'checkIns' : input.action === 'createPlacePost' ? 'placePosts' : input.action === 'createComment' ? 'comments' : 'meetups';
    if (v.item !== null && (!validMapItem(v.item, scope) || v.item.id !== v.resourceId)) throw failure();
    if (v.item === null && v.status !== 'unavailable' && !(input.action === 'leaveMeetup' && v.status === 'left')) throw failure();
    if ('meetupId' in input && v.resourceId !== input.meetupId || 'targetId' in input && v.resourceId !== input.targetId) throw failure();
    const row = v.item as Record<string, unknown> | null;
    if (row && ((input.action === 'checkIn' || input.action === 'createPlacePost') && row.place_id !== input.placeId || input.action === 'createComment' && row.post_id !== input.postId)) throw failure();
    if (row && ['createPlacePost', 'createComment'].includes(input.action) && row.content !== (input as { content: string }).content) throw failure();
    if (row && ['createPlace', 'createMeetup', 'createPlacePost', 'createComment', 'checkIn'].includes(input.action)) {
      const owner = scope === 'places' ? row.created_by : scope === 'meetups' ? row.host_id : row.user_id;
      if (owner !== actor.profileId) throw failure();
    }
    if (row && input.action === 'createPlace' && (row.name !== input.name || row.category !== input.category || row.latitude !== input.latitude || row.longitude !== input.longitude || (row.photo_url || undefined) !== input.photoUrl)) throw failure();
    if (row && input.action === 'createMeetup' && (row.title !== input.title || row.dest_latitude !== input.latitude || row.dest_longitude !== input.longitude)) throw failure();
    if (row && (input.action === 'joinMeetup' || input.action === 'leaveMeetup') && (!object(row.membership) || row.membership.status !== v.status)) throw failure();
    return { ...v, validUntil } as MapReceipt;
  } finally { active = false; if (timer) clearTimeout(timer); }
}

const STORAGE = 'vybe-map-social-attempts-v1';
const memory = new Map<string, string>();
/** Store only hashes and request IDs; map coordinates and draft text stay out of retry storage. */
export async function mapSocialAttempt(actor: MapActor, input: MapMutation) {
  const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))) as MapMutation;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([actor.uid, actor.profileId, body])));
  const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const read = (): Record<string, string> => {
    try { const data: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '{}'); return object(data) ? Object.fromEntries(Object.entries(data).filter(([k, value]) => /^[a-f0-9]{64}$/.test(k) && typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)).slice(-32)) as Record<string, string> : {}; } catch { return {}; }
  };
  const entries = read(); const requestId = memory.get(key) || entries[key] || crypto.randomUUID();
  memory.set(key, requestId); entries[key] = requestId;
  while (memory.size > 32) memory.delete(memory.keys().next().value!);
  try { sessionStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(entries).slice(-32)))); } catch { /* In-memory retry remains available. */ }
  return { body: { ...body, requestId }, complete() { memory.delete(key); const current = read(); delete current[key]; try { sessionStorage.setItem(STORAGE, JSON.stringify(current)); } catch { /* Restricted storage. */ } } };
}
