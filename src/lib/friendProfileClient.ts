import { invokeFunction } from '@/lib/firebase/functionsService';

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

export async function resolveProfileVisibility(targetId: string) {
  return invokeFunction<{
    ok?: boolean;
    fields?: Record<string, boolean>;
    settings?: Record<string, string>;
  }>('resolve-profile-visibility', { target_id: targetId }).single();
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
