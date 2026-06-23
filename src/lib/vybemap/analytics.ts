type MapAnalyticsEvent =
  | 'map_open'
  | 'layer_toggle'
  | 'friend_tap'
  | 'find_friend_start'
  | 'find_friend_found'
  | 'ar_mode_start'
  | 'spot_tap'
  | 'spot_drop_open'
  | 'spot_dropped'
  | 'meetup_tap'
  | 'meetup_create'
  | 'meetup_join'
  | 'check_in'
  | 'place_view'
  | 'story_view'
  | 'clip_view'
  | 'teleport'
  | 'time_machine'
  | 'discovery_open';

export function trackMapEvent(event: MapAnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    void import('@/lib/analytics').then((m) => {
      if (typeof m.trackEvent === 'function') {
        m.trackEvent(`vybemap_${event}`, props);
      }
    });
  } catch {
    if (import.meta.env.DEV) console.debug('[VybeMap analytics]', event, props);
  }
}
