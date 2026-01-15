/**
 * VYBE Analytics - Non-invasive event tracking
 * 
 * Events are logged in dev mode and prepared for future analytics integration.
 * No external services are used - this is purely for internal tracking.
 */

type AnalyticsEvent = 
  | 'onboarding_complete'
  | 'post_created'
  | 'dm_sent'
  | 'call_started'
  | 'call_ended'
  | 'notification_opened'
  | 'clip_viewed'
  | 'story_viewed'
  | 'profile_viewed'
  | 'search_performed'
  | 'friend_added'
  | 'group_created'
  | 'theme_changed'
  | 'error_occurred';

interface AnalyticsData {
  [key: string]: string | number | boolean | undefined;
}

// Store events in memory for debugging
const eventLog: Array<{ name: AnalyticsEvent; data?: AnalyticsData; timestamp: string }> = [];
const MAX_EVENTS = 100;

/**
 * Track an analytics event
 * In production, this would send to an analytics service
 */
export function trackEvent(name: AnalyticsEvent, data?: AnalyticsData) {
  const event = {
    name,
    data,
    timestamp: new Date().toISOString(),
  };
  
  // Log in dev mode
  if (import.meta.env.DEV) {
    console.log('[Analytics]', name, data);
  }
  
  // Store in memory
  eventLog.push(event);
  if (eventLog.length > MAX_EVENTS) {
    eventLog.shift();
  }
  
  // Future: Send to analytics service
  // await fetch('/api/analytics', { method: 'POST', body: JSON.stringify(event) });
}

/**
 * Get recent events (for debugging)
 */
export function getEventLog() {
  return [...eventLog];
}

/**
 * Clear event log
 */
export function clearEventLog() {
  eventLog.length = 0;
}

// Convenience functions for common events
export const analytics = {
  track: trackEvent,
  
  onboardingComplete: (data?: { step?: string }) => 
    trackEvent('onboarding_complete', data),
  
  postCreated: (data?: { type?: string; hasMedia?: boolean }) => 
    trackEvent('post_created', data),
  
  dmSent: (data?: { hasMedia?: boolean; isGroup?: boolean }) => 
    trackEvent('dm_sent', data),
  
  callStarted: (data?: { type?: 'audio' | 'video'; isGroup?: boolean }) => 
    trackEvent('call_started', data),
  
  callEnded: (data?: { duration?: number; type?: 'audio' | 'video' }) => 
    trackEvent('call_ended', data),
  
  notificationOpened: (data?: { type?: string }) => 
    trackEvent('notification_opened', data),
  
  error: (data?: { message?: string; component?: string }) => 
    trackEvent('error_occurred', data),
};
