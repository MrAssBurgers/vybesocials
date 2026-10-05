import { z } from 'zod';
import { getFirebaseAuth } from '@/lib/firebase/authService';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import { validPostMediaUrl } from '@/lib/postMediaUrl';

const id = z.string().min(1).refine(value => !value.includes('/') && value !== '.' && value !== '..' && new TextEncoder().encode(value).length <= 1500);
const revision = z.string().regex(/^[a-f0-9]{48}$/), pinId = z.string().regex(/^[a-f0-9]{64}$/);
const stamp = z.number().int().positive();
const media = z.string().max(8192).refine(validPostMediaUrl).nullable();
const pinSchema = z.object({
  id: pinId, sourceId: id, kind: z.enum(['post', 'clip']), sourceType: z.enum(['post', 'short', 'video']),
  revision, publicationRevision: revision, userId: id, caption: z.string().max(10000), mediaUrl: media, thumbnailUrl: media,
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), precision: z.literal('approximate'), radiusMeters: z.literal(2000),
  areaLabel: z.string().trim().min(1).max(120), sharedAt: z.string().datetime(),
  author: z.object({ id, username: z.string().max(100), displayName: z.string().max(200).nullable(), avatarUrl: media }),
}).refine(pin => pin.author.id === pin.userId && (pin.kind === 'clip' ? pin.sourceType === 'short' : pin.sourceType !== 'short'));
export type MapContentPin = z.infer<typeof pinSchema>;
export type MapPinKind = 'post' | 'clip';
export type MapPinActor = { uid: string; profileId: string };
export type MapPinArea = { latitude: number; longitude: number; label: string };
type Base = { validUntil: number };
export type MapPinState = Base & { kind: MapPinKind; sourceId: string; status: 'unshared' | 'shared' | 'removed' | 'unavailable'; revision: string | null; sourceRevision: string | null; canShare: boolean; pin: MapContentPin | null };
export type MapPinReceipt = MapPinState & { requestId: string; replayed: boolean; applied: boolean; acknowledge: () => void };
export type MapPinPage = Base & { kind: MapPinKind; items: MapContentPin[]; nextCursor: string | null };
export type MapPinRead = Base & { pinId: string; pin: MapContentPin | null };
export type MapPinMutation = { action: 'share'; kind: MapPinKind; sourceId: string; expectedRevision: string | null; expectedSourceRevision: string; area: MapPinArea }
  | { action: 'remove'; kind: MapPinKind; sourceId: string; expectedRevision: string };
export type MapPinInput = MapPinMutation | { action: 'state'; kind: MapPinKind; sourceId: string } | { action: 'list'; kind: MapPinKind; cursor?: string } | { action: 'read'; pinId: string };
const envelope = z.object({ ok: z.literal(true), action: z.enum(['state', 'share', 'remove', 'list', 'read']), ownerUid: id, profileId: id, accountCreatedAt: stamp, serverTime: stamp, validUntil: stamp }).passthrough();
const stateSchema = z.object({ kind: z.enum(['post', 'clip']), sourceId: id, status: z.enum(['unshared', 'shared', 'removed', 'unavailable']), revision: revision.nullable(), sourceRevision: revision.nullable(), canShare: z.boolean(), pin: pinSchema.nullable() });
const storageKey = 'vybe:map-pin-attempts:v1', pending = new Map<string, string>();
function stored(): Record<string, string> {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key, value]) => /^[a-f0-9]{64}$/.test(key) && z.string().uuid().safeParse(value).success).slice(-32)) as Record<string, string> : {}; } catch { return {}; }
}
function save(rows: Record<string, string>) { try { sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(rows).slice(-32)))); } catch { /* Retain the bounded in-memory retry. */ } }
async function retain(body: object, guard: () => void) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body))); guard();
  const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const rows = stored(), requestId = pending.get(key) || rows[key] || crypto.randomUUID(); pending.set(key, requestId); rows[key] = requestId; save(rows);
  while (pending.size > 32) pending.delete(pending.keys().next().value!);
  return { requestId, complete() { if (pending.get(key) === requestId) pending.delete(key); const rows = stored(); if (rows[key] === requestId) delete rows[key]; save(rows); } };
}
export function snapMapPinArea(latitude: number, longitude: number): Pick<MapPinArea, 'latitude' | 'longitude'> {
  const center = (coordinate: number, offset: number, max: number) => Number((Math.min(max - 1, Math.max(0, Math.floor((coordinate + offset) / 0.02))) * 0.02 - offset + 0.01).toFixed(2));
  return { latitude: center(latitude, 90, 9000), longitude: center(longitude, 180, 18000) };
}
/** Coordinates never enter retry storage: only a body hash and UUID are retained. */
export async function manageMapPin(actor: MapPinActor, input: MapPinInput, extraGuard: () => void): Promise<MapPinState | MapPinReceipt | MapPinPage | MapPinRead> {
  const guard = profileAccountGuard(actor.uid, extraGuard), user = getFirebaseAuth()?.currentUser;
  const createdAt = Date.parse(user?.metadata.creationTime || '');
  if (!user || user.uid !== actor.uid || !id.safeParse(actor.profileId).success || !stamp.safeParse(createdAt).success) throw new Error('Sign in again to check map sharing.');
  const body = { ...JSON.parse(JSON.stringify(input)), expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: createdAt };
  let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { guard(); if (!active || getFirebaseAuth()?.currentUser !== user) throw new Error('This map sharing request has ended. Please retry.'); };
  const invalid = () => new Error('Map sharing could not be confirmed. Please retry.');
  try {
    current();
    return await Promise.race([
      (async () => {
        const attempt = input.action === 'share' || input.action === 'remove' ? await retain(body, current) : null; current();
        const started = performance.now(), result = await invokeFunction<unknown>('manageMapPin', { ...body, ...(attempt ? { requestId: attempt.requestId } : {}) }); current();
        if (result.error) {
          const code = String(result.error.code || result.error.name || '').replace(/^functions\//, '');
          if (['invalid-argument', 'aborted', 'already-exists'].includes(code)) attempt?.complete();
          throw Object.assign(new Error(result.error.message || 'Map sharing is unavailable. Please retry.'), { code });
        }
        const parsed = envelope.safeParse(result.data); if (!parsed.success) throw invalid();
        const row = parsed.data;
        if (row.action !== body.action || row.ownerUid !== body.expectedOwnerUid || row.profileId !== body.expectedProfileId || row.accountCreatedAt !== createdAt || row.validUntil <= row.serverTime || row.validUntil > row.serverTime + 15_000) throw invalid();
        const validUntil = Date.now() + Math.max(0, row.validUntil - row.serverTime - Math.max(0, performance.now() - started));
        if (validUntil <= Date.now()) throw new Error('Map sharing access expired while checking. Please retry.');
        if (input.action === 'list') {
          const page = z.object({ kind: z.literal(input.kind), items: z.array(pinSchema).max(20), nextCursor: revision.nullable() }).safeParse(row);
          if (!page.success || page.data.items.some(pin => pin.kind !== input.kind) || (input.cursor && page.data.nextCursor === input.cursor) || new Set(page.data.items.map(pin => pin.id)).size !== page.data.items.length) throw invalid();
          return { ...page.data, validUntil } as MapPinPage;
        }
        if (input.action === 'read') {
          const read = z.object({ pinId: z.literal(input.pinId), pin: pinSchema.nullable() }).safeParse(row);
          if (!read.success || (read.data.pin && read.data.pin.id !== input.pinId)) throw invalid();
          return { ...read.data, validUntil } as MapPinRead;
        }
        const state = stateSchema.safeParse(row); if (!state.success) throw invalid();
        const value = state.data;
        if (value.kind !== input.kind || value.sourceId !== input.sourceId || (value.status === 'shared') !== !!value.pin || (value.canShare && !value.sourceRevision)
          || (value.pin && (value.pin.kind !== input.kind || value.pin.sourceId !== input.sourceId || value.pin.userId !== actor.profileId || value.pin.revision !== value.revision))) throw invalid();
        if (!attempt) return { ...value, validUntil } as MapPinState;
        if (row.requestId !== attempt.requestId || typeof row.replayed !== 'boolean' || typeof row.applied !== 'boolean') throw invalid();
        if (row.applied && (input.action === 'remove' ? value.status !== 'removed' : value.status !== 'shared')) throw invalid();
        if (row.applied && input.action === 'share') {
          const expected = snapMapPinArea(body.area.latitude, body.area.longitude);
          if (value.pin?.latitude !== expected.latitude || value.pin.longitude !== expected.longitude || value.pin.areaLabel !== body.area.label.trim()) throw invalid();
        }
        const acknowledge = () => { guard(); if (getFirebaseAuth()?.currentUser !== user || validUntil <= Date.now()) throw new Error('Reopen map sharing to confirm this change.'); attempt.complete(); };
        return { ...value, validUntil, requestId: attempt.requestId, replayed: row.replayed, applied: row.applied, acknowledge } as MapPinReceipt;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Map sharing took too long. Please retry.')); }, 15_000); }),
    ]);
  } finally { active = false; if (timer) clearTimeout(timer); }
}
export async function readMapPin(actor: MapPinActor, pinId: string, guard: () => void): Promise<MapPinRead> {
  return manageMapPin(actor, { action: 'read', pinId }, guard) as Promise<MapPinRead>;
}
