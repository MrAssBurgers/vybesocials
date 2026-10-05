import { getFirebaseAuth } from '@/lib/firebase/authService';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import type { MapGroupMap } from './types';

export const SQUAD_EMOJIS = ['🗺️', '🔥', '✨', '🎉', '🌴', '🏙️', '⚡', '💜'];
export type SquadActor = { uid: string; profileId: string };
export type SquadMutation =
  | { action: 'create'; name: string; emoji: string }
  | { action: 'createInvite' | 'archive'; squadId: string; expectedRevision: string }
  | { action: 'join'; token: string }
  | { action: 'leave'; squadId: string; expectedMembershipRevision: string }
  | { action: 'recreate'; legacySquadId: string; expectedRevision: string };
export type SquadRead = { action: 'list'; cursor?: string } | { action: 'read'; squadId: string; cursor?: string }
  | { action: 'matchMembers'; squadId: string; candidateProfileIds: string[] } | { action: 'previewInvite'; token: string };
export type SquadMember = { profile_id: string; username: string | null; display_name: string | null; avatar_url: string | null; role: 'owner' | 'member' };
type Base = { validUntil: number; serverTime: number };
export type SquadPage = Base & { items: MapGroupMap[]; nextCursor: string | null };
export type SquadDetail = Base & { squadId: string; squad: MapGroupMap | null; members: SquadMember[]; nextCursor: string | null };
export type SquadMatches = Base & { squadId: string; matchedProfileIds: string[] };
export type SquadPreview = Base & { token: string; invite: { squad: Pick<MapGroupMap, 'id' | 'name' | 'emoji' | 'color' | 'owner_id' | 'revision' | 'member_count'>; expiresAt: number } | null };
export type SquadReceipt = Base & { requestId: string; squadId: string; status: 'active' | 'left' | 'archived' | 'unavailable'; squad: MapGroupMap | null; membership: MapGroupMap['membership']; invite?: { token: string; expiresAt: number; active: boolean } | null; invitationExpiresAt?: number; acknowledge?: () => void };
type Result = SquadPage | SquadDetail | SquadMatches | SquadPreview | SquadReceipt;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('/');
const rev = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v);
const token = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const nullableText = (v: unknown, max: number) => v === null || (typeof v === 'string' && v.length <= max);
const membership = (v: unknown) => v === null || (obj(v) && ['owner', 'member'].includes(String(v.role)) && ['active', 'left'].includes(String(v.status)) && rev(v.revision));
function squad(v: unknown, preview = false): v is MapGroupMap {
  if (!obj(v) || !id(v.id) || !id(v.owner_id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40 || typeof v.emoji !== 'string' || v.emoji.length > 24 || typeof v.color !== 'string' || !/^#[a-f\d]{6}$/i.test(v.color) || !rev(v.revision) || !number(v.member_count)) return false;
  if (preview) return true;
  return typeof v.created_at === 'string' && Number.isFinite(Date.parse(v.created_at)) && typeof v.legacy === 'boolean' && v.status === (v.legacy ? 'legacy' : 'active') && membership(v.membership) && (v.legacy ? v.membership === null && v.member_count === 0 : obj(v.membership) && v.membership.status === 'active');
}
const fail = () => new Error('The squad response could not be confirmed. Please retry.');
const readAction = (input: SquadRead | SquadMutation): input is SquadRead => ['list', 'read', 'matchMembers', 'previewInvite'].includes(input.action);
const STORAGE = 'vybe:squad-attempts:v1';
const pending = new Map<string, string>();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v);
function stored(): Record<string, string> {
  try { const value = JSON.parse(sessionStorage.getItem(STORAGE) || '{}'); return obj(value) ? Object.fromEntries(Object.entries(value).filter(([key, value]) => token(key) && uuid(value)).slice(-32)) as Record<string, string> : {}; } catch { return {}; }
}
async function attempt(body: object, guard: () => void) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body))); guard();
  const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const saved = stored(), requestId = pending.get(key) || saved[key] || crypto.randomUUID();
  pending.set(key, requestId); saved[key] = requestId;
  while (pending.size > 32) pending.delete(pending.keys().next().value!);
  try { sessionStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-32)))); } catch { /* Memory retains uncertain requests. */ }
  return { requestId, complete() { pending.delete(key); const saved = stored(); delete saved[key]; try { sessionStorage.setItem(STORAGE, JSON.stringify(saved)); } catch { /* Restricted storage. */ } } };
}

/** Only hashed bodies and UUIDs are retained; invite codes and squad names never enter retry storage. */
export async function manageMapSquad(actor: SquadActor, input: SquadRead | SquadMutation, extraGuard: () => void, options: { deferAcknowledgement?: boolean } = {}): Promise<Result> {
  const guard = profileAccountGuard(actor.uid, extraGuard), user = getFirebaseAuth()?.currentUser;
  const createdAt = Date.parse(user?.metadata.creationTime || '');
  if (!user || user.uid !== actor.uid || !id(actor.profileId) || !number(createdAt) || !createdAt) throw new Error('Sign in again to confirm your squad.');
  let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { guard(); if (!active || getFirebaseAuth()?.currentUser !== user) throw new Error('This squad request has ended. Reopen it and retry.'); };
  const payload = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
  const body = { ...payload, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: createdAt };
  const retained = readAction(input) ? null : await attempt(body, current);
  const request = { ...body, ...(retained ? { requestId: retained.requestId } : {}) };
  const started = performance.now();
  try {
    current();
    const result = await Promise.race([invokeFunction<unknown>('manageMapSquad', request), new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('The squad request took too long. Please retry.')); }, 15_000); })]);
    current();
    if (result.error) {
      const code = String(result.error.code || result.error.name || '').replace(/^functions\//, '');
      if (['invalid-argument', 'aborted', 'failed-precondition'].includes(code)) retained?.complete();
      throw Object.assign(new Error(result.error.message || 'Squads are unavailable. Please retry.'), { code });
    }
    const row = result.data;
    if (!obj(row) || row.ok !== true || row.action !== input.action || row.ownerUid !== actor.uid || row.profileId !== actor.profileId || row.accountCreatedAt !== createdAt || !number(row.serverTime) || !number(row.validUntil) || row.validUntil < row.serverTime || row.validUntil > row.serverTime + 15_000) throw fail();
    let validUntil = Date.now() + Math.max(0, row.validUntil - row.serverTime - (performance.now() - started));
    let invitationExpiresAt: number | undefined;
    const cursor = (v: unknown) => v === null || (rev(v) && (!('cursor' in input) || v !== input.cursor));
    if (input.action === 'list') {
      if (!Array.isArray(row.items) || row.items.length > 20 || !row.items.every(value => squad(value)) || !cursor(row.nextCursor)) throw fail();
    } else if (input.action === 'read') {
      if (row.squadId !== input.squadId || !(row.squad === null || squad(row.squad) && row.squad.id === input.squadId) || !Array.isArray(row.members) || row.members.length > 20 || !row.members.every(value => obj(value) && id(value.profile_id) && nullableText(value.username, 80) && nullableText(value.display_name, 120) && nullableText(value.avatar_url, 8192) && ['owner', 'member'].includes(String(value.role))) || !cursor(row.nextCursor) || (row.squad === null && (row.members.length || row.nextCursor !== null))) throw fail();
    } else if (input.action === 'matchMembers') {
      if (row.squadId !== input.squadId || !Array.isArray(row.matchedProfileIds) || row.matchedProfileIds.length > 100 || !row.matchedProfileIds.every(value => id(value) && input.candidateProfileIds.includes(value)) || new Set(row.matchedProfileIds).size !== row.matchedProfileIds.length) throw fail();
    } else if (input.action === 'previewInvite') {
      if (row.token !== input.token || !(row.invite === null || obj(row.invite) && squad(row.invite.squad, true) && number(row.invite.expiresAt) && row.invite.expiresAt > row.serverTime && row.invite.expiresAt <= row.serverTime + 86_400_000)) throw fail();
      if (obj(row.invite)) validUntil = Math.min(validUntil, Date.now() + Math.max(0, Number(row.invite.expiresAt) - row.serverTime - (performance.now() - started)));
    } else {
      if (row.requestId !== retained?.requestId || !id(row.squadId) || ('squadId' in input && row.squadId !== input.squadId) || !['active', 'left', 'archived', 'unavailable'].includes(String(row.status)) || !membership(row.membership) || !(row.squad === null || squad(row.squad) && row.squad.id === row.squadId) || (row.status === 'active' && (!obj(row.membership) || row.membership.status !== 'active' || row.squad === null))) throw fail();
      if (row.squad !== null && (row.status !== 'active' || (row.squad as MapGroupMap).legacy)) throw fail();
      if (row.status === 'left' && (!obj(row.membership) || row.membership.status !== 'left')) throw fail();
      if (['archived', 'unavailable'].includes(String(row.status)) && row.membership !== null) throw fail();
      if (row.squad !== null && obj(row.membership)) {
        const inner = (row.squad as MapGroupMap).membership;
        if (!inner || inner.role !== row.membership.role || inner.status !== row.membership.status || inner.revision !== row.membership.revision) throw fail();
      }
      if (row.squad && ['create', 'recreate', 'createInvite'].includes(input.action) && (row.squad as MapGroupMap).owner_id !== actor.profileId) throw fail();
      if (row.status === 'active' && ['create', 'recreate', 'createInvite'].includes(input.action) && (!obj(row.membership) || row.membership.role !== 'owner')) throw fail();
      if (input.action === 'create' && row.squad && ((row.squad as MapGroupMap).name !== input.name.trim() || (row.squad as MapGroupMap).emoji !== input.emoji)) throw fail();
      if (input.action === 'createInvite') {
        if (!(row.invite === null || obj(row.invite) && token(row.invite.token) && number(row.invite.expiresAt) && row.invite.expiresAt <= row.serverTime + 86_400_000 && typeof row.invite.active === 'boolean' && (!row.invite.active || row.status === 'active' && row.invite.expiresAt > row.serverTime))) throw fail();
        if (obj(row.invite) && row.invite.active) {
          // Token lifetime is separate from this request's short admission lease.
          invitationExpiresAt = Date.now() + Math.max(0, Number(row.invite.expiresAt) - row.serverTime - (performance.now() - started));
          validUntil = Math.min(validUntil, invitationExpiresAt);
        }
      }
    }
    if (validUntil <= Date.now()) throw new Error('Squad access expired while checking. Please retry.');
    const acknowledge = () => { guard(); if (getFirebaseAuth()?.currentUser !== user || validUntil <= Date.now()) throw new Error('Reopen the squad to confirm this update.'); retained?.complete(); };
    if (!options.deferAcknowledgement) acknowledge();
    return { ...row, validUntil, invitationExpiresAt, ...(retained && options.deferAcknowledgement ? { acknowledge } : {}) } as Result;
  } finally { active = false; if (timer) clearTimeout(timer); }
}

export function squadInviteToken(value: string): string | null {
  const trimmed = value.trim(); if (token(trimmed)) return trimmed;
  try { const url = new URL(trimmed); if (url.origin !== window.location.origin || url.pathname !== '/map') return null; const parsed = new URLSearchParams(url.hash.slice(1)).get('squad-invite'); return token(parsed) ? parsed : null; } catch { return null; }
}
