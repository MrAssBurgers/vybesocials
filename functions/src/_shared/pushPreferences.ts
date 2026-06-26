import { db } from './admin.js';

export type NotificationPrefKey =
  | 'dms_enabled'
  | 'calls_enabled'
  | 'comments_enabled'
  | 'likes_enabled'
  | 'follows_enabled'
  | 'friend_requests_enabled'
  | 'mentions_enabled'
  | 'stories_enabled'
  | 'announcements_enabled'
  | 'nearby_enabled'
  | 'brief_pings_enabled'
  | 'friend_activity_enabled'
  | 'trending_local_enabled';

export type NotificationPrefs = Partial<
  Record<NotificationPrefKey | 'show_message_preview' | 'quiet_hours_start' | 'quiet_hours_end', boolean | string | null>
>;

export async function loadNotificationPreferences(profileId: string): Promise<NotificationPrefs | null> {
  const snap = await db
    .collection('notification_preferences')
    .where('user_id', '==', profileId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as NotificationPrefs;
}

export function prefKeyForPushType(type: string): NotificationPrefKey | null {
  switch (type) {
    case 'dm':
    case 'group_message':
    case 'message':
    case 'typing':
      return 'dms_enabled';
    case 'call':
      return 'calls_enabled';
    case 'like':
      return 'likes_enabled';
    case 'comment':
      return 'comments_enabled';
    case 'follow':
      return 'follows_enabled';
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_declined':
      return 'friend_requests_enabled';
    case 'mention':
      return 'mentions_enabled';
    case 'announcement':
      return 'announcements_enabled';
    case 'map_wave':
    case 'map_meetup':
      return 'nearby_enabled';
    case 'smart_ping':
      return 'brief_pings_enabled';
    default:
      return null;
  }
}

export function isPushAllowedForType(type: string, prefs: NotificationPrefs | null): boolean {
  const key = prefKeyForPushType(type);
  if (!key) return true;
  if (!prefs) return true;
  return prefs[key] !== false;
}

/** Calls break through quiet hours; everything else respects them when configured. */
export function isBlockedByQuietHours(type: string, prefs: NotificationPrefs | null): boolean {
  if (type === 'call') return false;
  if (!prefs) return false;
  const start = typeof prefs.quiet_hours_start === 'string' ? prefs.quiet_hours_start : null;
  const end = typeof prefs.quiet_hours_end === 'string' ? prefs.quiet_hours_end : null;
  if (!start || !end) return false;

  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const startM = parse(start);
  const endM = parse(end);
  if (startM <= endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}

export function sanitizeDmPushBody(
  body: string,
  type: string,
  prefs: NotificationPrefs | null,
): string {
  const isDmLike = type === 'dm' || type === 'group_message' || type === 'typing' || type === 'message';
  if (!isDmLike) return body;
  if (prefs?.show_message_preview === false) {
    if (type === 'typing') return 'typing…';
    if (type === 'group_message') return 'New group message';
    return 'New Chat';
  }
  return body;
}
