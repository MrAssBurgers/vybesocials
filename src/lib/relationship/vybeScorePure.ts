/** Client-testable VYBE Score policy helpers (mirrors server anti-abuse rules). */

export type VybeScoreEventType =
  | 'snap_sent'
  | 'message_sent'
  | 'friend_accepted'
  | 'comment_created';

const EVENT_POINTS: Partial<Record<VybeScoreEventType, number>> = {
  snap_sent: 2,
  friend_accepted: 1,
  comment_created: 1,
};

const DAILY_CAPS: Partial<Record<VybeScoreEventType, number>> = {
  friend_accepted: 10,
  comment_created: 20,
};

export function shouldAwardVybeScoreEvent(eventType: VybeScoreEventType): boolean {
  if (eventType === 'message_sent') return false;
  const points = EVENT_POINTS[eventType] ?? 0;
  return points > 0;
}

export function vybeScorePointsForEvent(eventType: VybeScoreEventType): number {
  if (eventType === 'message_sent') return 0;
  return EVENT_POINTS[eventType] ?? 0;
}

/** Other people see a public score. Private scores stay with the owner. Friends-only scores need a confirmed friendship. */
export function canShowVybeScore(input: {
  own: boolean;
  privacy?: 'public' | 'friends_only' | 'private';
  friend?: boolean;
}): boolean {
  if (input.own) return true;
  if (input.privacy === 'private') return false;
  if (input.privacy === 'friends_only') return input.friend === true;
  return true;
}

export function isUnderVybeDailyCap(
  eventType: VybeScoreEventType,
  currentCount: number,
): boolean {
  const cap = DAILY_CAPS[eventType];
  if (cap == null) return true;
  return currentCount < cap;
}
