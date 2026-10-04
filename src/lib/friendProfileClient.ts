import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard, type ReportAccountGuard } from './reportModerationService';
import { PROFILE_VISIBILITY_FIELDS, isVisibilityLevel, visibilityRow, type ResolvedProfileVisibility } from './profileVisibility';

export type LocationDuration =
  | 'once'
  | '1h'
  | 'until_tonight'
  | '24h'
  | 'indefinite'
  | 'while_using'
  | 'custom';

export interface FriendshipPairRow {
  id: string;
  user_a: string;
  user_b: string;
  friends_since?: string;
  message_count?: number;
  snap_count?: number;
  call_count?: number;
  shared_clip_count?: number;
  saved_memory_count?: number;
  current_streak?: number;
  longest_streak?: number;
  friendship_level?: number;
  updated_at?: string;
}

export async function refreshFriendshipPairStats(otherProfileId: string) {
  return invokeFunction<{ ok?: boolean; pair?: FriendshipPairRow }>(
    'refresh-friendship-pair-stats',
    { other_profile_id: otherProfileId },
  ).single();
}

export async function resolveProfileVisibility(input: { targetId: string; expectedOwnerUid: string; expectedProfileId: string }, guard: ReportAccountGuard = reportAccountGuard(input.expectedOwnerUid)): Promise<ResolvedProfileVisibility> {
  guard();
  const { data, error } = await invokeFunction<unknown>('resolve-profile-visibility', {
    target_id: input.targetId, expectedOwnerUid: input.expectedOwnerUid, expectedProfileId: input.expectedProfileId,
  }).single();
  guard();
  if (error) throw Object.assign(new Error(error.message || 'Profile privacy could not be checked. Please retry.'), { code: error.code || error.name });
  const invalid = () => { throw new Error('Profile privacy could not be confirmed. Please retry.'); };
  if (!visibilityRow(data) || data.ok !== true || data.ownerUid !== input.expectedOwnerUid || data.viewerProfileId !== input.expectedProfileId
    || data.targetProfileId !== input.targetId || typeof data.isSelf !== 'boolean' || typeof data.isFriend !== 'boolean' || typeof data.isBlocked !== 'boolean'
    || !visibilityRow(data.fields) || !visibilityRow(data.settings)) return invalid();
  if (Object.keys(data.fields).length !== PROFILE_VISIBILITY_FIELDS.length || Object.keys(data.settings).length !== PROFILE_VISIBILITY_FIELDS.length
    || data.isSelf !== (input.targetId === input.expectedProfileId) || (data.isBlocked && (data.isFriend || data.isSelf))) return invalid();
  for (const field of PROFILE_VISIBILITY_FIELDS) {
    const setting = data.settings[field];
    if (typeof data.fields[field] !== 'boolean' || (!isVisibilityLevel(setting) && setting !== 'unavailable')
      || (setting === 'unavailable' && data.fields[field]) || (data.isBlocked && data.fields[field])
      || (data.fields[field] && !data.isSelf && ((setting === 'only_me' || setting === 'private')
        || ((setting === 'friends' || setting === 'close_friends') && !data.isFriend)))) return invalid();
  }
  return data as unknown as ResolvedProfileVisibility;
}

export async function indexSharedContent(opts: {
  otherProfileId: string;
  contentType: string;
  contentId: string;
  title?: string | null;
  thumbnailUrl?: string | null;
}) {
  return invokeFunction<{ ok?: boolean; id?: string }>('index-shared-content', {
    other_profile_id: opts.otherProfileId,
    content_type: opts.contentType,
    content_id: opts.contentId,
    title: opts.title ?? null,
    thumbnail_url: opts.thumbnailUrl ?? null,
  }).single();
}

export async function createLocationRequest(opts: {
  targetId: string;
  duration?: LocationDuration;
  precision?: string;
  message?: string | null;
  customMinutes?: number;
}) {
  return invokeFunction<{ ok?: boolean; request_id?: string }>('create-location-request', {
    target_id: opts.targetId,
    duration: opts.duration ?? '1h',
    precision: opts.precision ?? 'approximate',
    message: opts.message ?? null,
    custom_minutes: opts.customMinutes,
  }).single();
}

export async function respondLocationRequest(opts: {
  requestId: string;
  intent: 'accept' | 'decline' | 'block';
  duration?: LocationDuration;
  customMinutes?: number;
}) {
  return invokeFunction<{
    ok?: boolean;
    status?: string;
    pair_id?: string;
    expires_at?: string;
  }>('respond-location-request', {
    request_id: opts.requestId,
    intent: opts.intent,
    duration: opts.duration,
    custom_minutes: opts.customMinutes,
  }).single();
}

export async function stopLocationShare(otherProfileId: string) {
  return invokeFunction<{ ok?: boolean }>('stop-location-share', {
    other_profile_id: otherProfileId,
  }).single();
}

export async function pauseLocationShare(otherProfileId: string, paused = true) {
  return invokeFunction<{ ok?: boolean; paused?: boolean }>('pause-location-share', {
    other_profile_id: otherProfileId,
    paused,
  }).single();
}
