import { invokeFunction } from '@/lib/firebase/functionsService';
import type { ReportAccountGuard } from '@/lib/reportModerationService';

export const ROULETTE_INTERESTS = ['Music', 'Gaming', 'Art', 'Tech', 'Fashion', 'Sports', 'Anime', 'Movies', 'Cooking', 'Travel', 'Fitness', 'Photography', 'Crypto', 'Comedy', 'Books', 'Nature'] as const;
export type RouletteMode = 'text' | 'audio' | 'video';
export type RouletteStatus = 'idle' | 'searching' | 'matched' | 'ended';
export interface RouletteMatch {
  id: string; user_a: string; user_b: string; mode: RouletteMode; shared_interests: string[];
  status: 'active'; conversation_id: string | null; started_at: string;
  call_starter_profile_id: string | null;
  partner: { id: string; username: string; avatar_url: string | null; display_name: string | null };
}
export interface RouletteRequest {
  action: 'join' | 'poll' | 'cancel' | 'end' | 'handoff';
  expectedOwnerUid: string; expectedProfileId: string; requestId: string;
  mode?: RouletteMode; interests?: string[]; matchId?: string;
}
export interface RouletteReply {
  ok: true; ownerUid: string; profileId: string; requestId: string; searchId: string;
  state: RouletteStatus; mode: RouletteMode; interests: string[]; expiresAt: number;
  match: RouletteMatch | null; resumed?: boolean;
}
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && ![...value].some(character => character.charCodeAt(0) < 32);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const mode = (value: unknown): value is RouletteMode => value === 'text' || value === 'audio' || value === 'video';
const interests = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 5 && new Set(value).size === value.length && value.every(item => typeof item === 'string' && (ROULETTE_INTERESTS as readonly string[]).includes(item));
const invalid = () => new Error('Your match could not be verified. Retry or leave this search.');
const nullableText = (value: unknown): value is string | null => value === null || typeof value === 'string';

/** The server supplies a current participant receipt; raw queue rows are private. */
export function validateRouletteReply(value: unknown, request: RouletteRequest): RouletteReply {
  if (!row(value) || value.ok !== true || value.ownerUid !== request.expectedOwnerUid || value.profileId !== request.expectedProfileId
    || value.requestId !== request.requestId || !uuid(value.searchId) || !mode(value.mode) || !interests(value.interests)
    || !['idle', 'searching', 'matched', 'ended'].includes(String(value.state)) || !Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) < 0
    || (value.resumed !== undefined && typeof value.resumed !== 'boolean')) throw invalid();
  if (value.state === 'matched') {
    const match = value.match;
    if (!row(match) || !id(match.id) || !id(match.user_a) || !id(match.user_b) || match.user_a === match.user_b
      || ![match.user_a, match.user_b].includes(request.expectedProfileId) || match.mode !== value.mode || match.status !== 'active'
      || !interests(match.shared_interests) || typeof match.started_at !== 'string' || !Number.isFinite(Date.parse(match.started_at))
      || !(match.conversation_id === null || id(match.conversation_id))
      || !(match.call_starter_profile_id === null || id(match.call_starter_profile_id) && [match.user_a, match.user_b].includes(match.call_starter_profile_id))) throw invalid();
    const partner = match.partner, peer = match.user_a === request.expectedProfileId ? match.user_b : match.user_a;
    if (!row(partner) || partner.id !== peer || typeof partner.username !== 'string' || !partner.username
      || !nullableText(partner.avatar_url) || !nullableText(partner.display_name)) throw invalid();
    if (request.action === 'handoff' && (request.matchId !== match.id || !match.conversation_id)) throw invalid();
  } else if (value.match !== null) throw invalid();
  if ((request.action === 'cancel' || request.action === 'end') && !['idle', 'ended'].includes(String(value.state))) throw invalid();
  if (request.action === 'handoff' && value.state !== 'matched') throw new Error('This match has ended. Find another vibe.');
  if ((value.state === 'searching' || value.state === 'matched') && Number(value.expiresAt) <= 0) throw invalid();
  if (request.action === 'join' && !value.resumed && (value.state === 'searching' || value.state === 'matched') && value.mode !== request.mode) throw invalid();
  return value as unknown as RouletteReply;
}

export async function rouletteRequest(request: RouletteRequest, guard: ReportAccountGuard): Promise<RouletteReply> {
  guard();
  if (!id(request.expectedOwnerUid) || !id(request.expectedProfileId) || !uuid(request.requestId)) throw new Error('Reopen Roulette with your current account.');
  const result = await invokeFunction<unknown>('find-roulette-match', { ...request }, { expectedOwnerUid: request.expectedOwnerUid, guard });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Roulette could not connect. Please retry.'), { code: result.error.code || result.error.name });
  return validateRouletteReply(result.data, request);
}
