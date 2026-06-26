import { db } from './admin.js';
export async function loadNotificationPreferences(profileId) {
    const snap = await db
        .collection('notification_preferences')
        .where('user_id', '==', profileId)
        .limit(1)
        .get();
    if (snap.empty)
        return null;
    return snap.docs[0].data();
}
export function prefKeyForPushType(type) {
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
export function isPushAllowedForType(type, prefs) {
    const key = prefKeyForPushType(type);
    if (!key)
        return true;
    if (!prefs)
        return true;
    return prefs[key] !== false;
}
/** Calls break through quiet hours; everything else respects them when configured. */
export function isBlockedByQuietHours(type, prefs) {
    if (type === 'call')
        return false;
    if (!prefs)
        return false;
    const start = typeof prefs.quiet_hours_start === 'string' ? prefs.quiet_hours_start : null;
    const end = typeof prefs.quiet_hours_end === 'string' ? prefs.quiet_hours_end : null;
    if (!start || !end)
        return false;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const parse = (s) => {
        const [h, m] = s.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    const startM = parse(start);
    const endM = parse(end);
    if (startM <= endM)
        return mins >= startM && mins < endM;
    return mins >= startM || mins < endM;
}
export function sanitizeDmPushBody(body, type, prefs) {
    const isDmLike = type === 'dm' || type === 'group_message' || type === 'typing' || type === 'message';
    if (!isDmLike)
        return body;
    if (prefs?.show_message_preview === false) {
        if (type === 'typing')
            return 'typing…';
        if (type === 'group_message')
            return 'New group message';
        return 'New Chat';
    }
    return body;
}
//# sourceMappingURL=pushPreferences.js.map