/**
 * CameraLaunchContext — one shared launch descriptor for every camera entry
 * point (Messages, Stories, VYBE Snap, Create, Profile, Group). The capture →
 * edit → send flow reads this to decide default destinations, preselected
 * recipients, and where the user lands afterwards.
 */
import type { CaptureTarget } from '@/lib/camera/cameraConfig';

export type CameraLaunchSource =
  | 'global'
  | 'conversation'
  | 'story'
  | 'profile'
  | 'group'
  | 'create';

export type SnapDestinationKind = 'direct' | 'story' | 'post' | 'clip';

export interface CameraLaunchContext {
  source: CameraLaunchSource;
  /** Preselected 1:1 or group conversation (source 'conversation'). */
  conversationId?: string;
  /** Preselected profile ids to send to (source 'profile' or explicit). */
  recipientIds?: string[];
  /** Preselected group conversation (source 'group'). */
  groupId?: string;
  /** Profile the camera was launched from (source 'profile'). */
  profileId?: string;
  /** Destination chosen before capture (source 'create') or an override. */
  defaultDestination?: SnapDestinationKind;
  /** Route to return to on finish/cancel. Wins over source-derived routes. */
  returnRoute?: string;
  /** When replying to a media message, attach as reply_to_id on send. */
  replyToMessageId?: string;
  /** Conversation the reply target belongs to (for validation / routing). */
  replyConversationId?: string;
}

/** Destination the editor preselects when the user hits Send. */
export function defaultDestinationForContext(
  ctx: CameraLaunchContext,
): SnapDestinationKind {
  if (ctx.defaultDestination) return ctx.defaultDestination;
  switch (ctx.source) {
    case 'story':
      return 'story';
    case 'create':
      return 'post';
    default:
      // global / conversation / profile / group all default to direct snaps
      return 'direct';
  }
}

/** Map the launch context onto the existing CaptureTarget (recording limits, mode tabs). */
export function captureTargetForContext(ctx: CameraLaunchContext): CaptureTarget {
  const destination = defaultDestinationForContext(ctx);
  if (destination === 'story') return 'story';
  if (destination === 'post') return 'post';
  if (destination === 'clip') return 'clip';
  switch (ctx.source) {
    case 'conversation':
    case 'group':
    case 'profile':
      return 'dm';
    default:
      return 'snap';
  }
}

/** Conversation preselected by the launch context, if any. */
export function preselectedConversationId(ctx: CameraLaunchContext): string | null {
  return ctx.conversationId ?? ctx.groupId ?? null;
}

/** Profile ids preselected by the launch context (deduped). */
export function preselectedRecipientIds(ctx: CameraLaunchContext): string[] {
  const ids = [...(ctx.recipientIds ?? [])];
  if (ctx.profileId) ids.push(ctx.profileId);
  return [...new Set(ids)];
}

/** True when the launch context arrives with somewhere to send already picked. */
export function hasPreselectedDestination(ctx: CameraLaunchContext): boolean {
  return (
    !!preselectedConversationId(ctx) ||
    preselectedRecipientIds(ctx).length > 0 ||
    defaultDestinationForContext(ctx) === 'story'
  );
}

/** Whether the Send To screen may offer public story destinations. */
export function allowsStoryDestinations(ctx: CameraLaunchContext): boolean {
  switch (ctx.source) {
    case 'global':
    case 'story':
    case 'create':
      return true;
    default:
      // Conversation / group / profile launches are private sends — don't mix
      // public post destinations in unless the context explicitly asked for it.
      return ctx.defaultDestination === 'story';
  }
}

/**
 * Route to navigate to after a send completes (or the flow is cancelled).
 * Returns null when the overlay should simply close in place.
 */
export function resolveReturnRoute(ctx: CameraLaunchContext): string | null {
  if (ctx.returnRoute) return ctx.returnRoute;
  switch (ctx.source) {
    case 'conversation':
      return ctx.conversationId ? `/messages/${ctx.conversationId}` : '/messages';
    case 'group':
      return ctx.groupId ? `/messages/${ctx.groupId}` : '/messages';
    case 'story':
      // Stories live on Home (StoriesBar) — there is no /stories route.
      return '/home';
    case 'profile':
      if (ctx.conversationId) return `/messages/${ctx.conversationId}`;
      return ctx.profileId ? `/profile/${ctx.profileId}` : null;
    case 'create':
    case 'global':
    default:
      return null;
  }
}
