/**
 * VYBE Analytics - Event tracking for pre-launch metrics
 * 
 * Tracks key conversion and engagement events
 */

import { db } from '@/lib/firebase';

export type AnalyticsEvent = 
  // Heartbeat / presence
  | 'heartbeat'
  | 'page_view'
  
  // Signup funnel
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  
  // Invite funnel
  | 'invite_link_created'
  | 'invite_link_copied'
  | 'invite_link_opened'
  | 'invite_accepted'
  
  // Content creation
  | 'post_created'
  | 'clip_uploaded'
  | 'story_created'
  
  // Engagement
  | 'dm_sent'
  | 'post_liked'
  | 'post_commented'
  | 'profile_viewed'
  | 'search_performed'
  | 'friend_added'
  | 'group_created'
  
  // Calls
  | 'call_started'
  | 'call_connected'
  | 'call_ended'
  
  // Tutorial
  | 'tutorial_started'
  | 'tutorial_completed'
  | 'tutorial_skipped'
  | 'tutorial_step_viewed'
  
  // Settings
  | 'theme_changed'
  | 'notifications_enabled'
  | 'notifications_denied'
  
  // Safety
  | 'content_reported'
  | 'user_blocked'
  | 'safety_scan_triggered'
  
  // Errors
  | 'error_occurred';

interface AnalyticsData {
  [key: string]: string | number | boolean | undefined | null;
}

// Generate a session ID that persists for the browser session
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('vybe_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('vybe_session_id', sessionId);
  }
  return sessionId;
};

// Store events in memory for debugging (dev mode)
const eventLog: Array<{ name: AnalyticsEvent; data?: AnalyticsData; timestamp: string }> = [];
const MAX_EVENTS = 100;

// Queue for batch sending
let eventQueue: Array<{ event_name: string; event_data: AnalyticsData; session_id: string }> = [];
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Flush events to database
 */
async function flushEvents() {
  if (eventQueue.length === 0) return;
  
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  
  try {
    const { data: { user } } = await db.auth.getUser();
    
    const events = eventsToSend.map(e => ({
      ...e,
      user_id: user?.id || null,
    }));
    
    await db.from('analytics_events').insert(events);
  } catch (error) {
    // On error, put events back in queue (up to limit)
    eventQueue = [...eventsToSend.slice(0, 50), ...eventQueue.slice(0, 50)];
    if (import.meta.env.DEV) {
      console.warn('[Analytics] Failed to flush events:', error);
    }
  }
}

/**
 * Schedule flush with debounce
 */
function scheduleFlush() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(flushEvents, 2000);
}

/**
 * Track an analytics event
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
  
  // Store in memory for debugging
  eventLog.push(event);
  if (eventLog.length > MAX_EVENTS) {
    eventLog.shift();
  }
  
  // Add to queue for database insert
  eventQueue.push({
    event_name: name,
    event_data: data || {},
    session_id: getSessionId(),
  });
  
  // Schedule flush
  scheduleFlush();
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

/**
 * Force flush pending events (call before page unload)
 */
export function forceFlush() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushEvents();
}

// Convenience functions for common events
export const analytics = {
  track: trackEvent,
  
  // Signup funnel
  signupStarted: () => trackEvent('signup_started'),
  signupCompleted: () => trackEvent('signup_completed'),
  
  // Onboarding
  onboardingStarted: () => trackEvent('onboarding_started'),
  onboardingCompleted: (data?: { step?: string }) => 
    trackEvent('onboarding_completed', data),
  onboardingSkipped: (data?: { atStep?: number }) =>
    trackEvent('onboarding_skipped', data),
  
  // Invites
  inviteLinkCreated: () => trackEvent('invite_link_created'),
  inviteLinkCopied: () => trackEvent('invite_link_copied'),
  inviteLinkOpened: (data?: { inviteCode?: string }) =>
    trackEvent('invite_link_opened', data),
  inviteAccepted: (data?: { inviterId?: string }) =>
    trackEvent('invite_accepted', data),
  
  // Content
  postCreated: (data?: { type?: string; hasMedia?: boolean }) => 
    trackEvent('post_created', data),
  clipUploaded: () => trackEvent('clip_uploaded'),
  storyCreated: () => trackEvent('story_created'),
  
  // Engagement
  dmSent: (data?: { hasMedia?: boolean; isGroup?: boolean }) => 
    trackEvent('dm_sent', data),
  
  // Calls
  callStarted: (data?: { type?: 'audio' | 'video'; isGroup?: boolean }) => 
    trackEvent('call_started', data),
  callConnected: (data?: { type?: 'audio' | 'video' }) =>
    trackEvent('call_connected', data),
  callEnded: (data?: { duration?: number; type?: 'audio' | 'video' }) => 
    trackEvent('call_ended', data),
  
  // Tutorial
  tutorialStarted: () => trackEvent('tutorial_started'),
  tutorialCompleted: () => trackEvent('tutorial_completed'),
  tutorialSkipped: (data?: { atStep?: number }) =>
    trackEvent('tutorial_skipped', data),
  
  // Notifications
  notificationsEnabled: () => trackEvent('notifications_enabled'),
  notificationsDenied: () => trackEvent('notifications_denied'),
  
  // Safety
  contentReported: (data?: { contentType?: string; reason?: string }) =>
    trackEvent('content_reported', data),
  userBlocked: () => trackEvent('user_blocked'),
  
  // Errors
  error: (data?: { message?: string; component?: string }) => 
    trackEvent('error_occurred', data),
};

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', forceFlush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      forceFlush();
    }
  });
}

/**
 * Start a heartbeat that fires every 2 minutes while the page is visible.
 * This ensures analytics_events reflects real active users.
 */
let heartbeatInterval: NodeJS.Timeout | null = null;

export function startHeartbeat() {
  if (heartbeatInterval) return;
  
  // Fire initial page_view
  trackEvent('page_view', { path: window.location.pathname });
  
  // Heartbeat every 2 minutes
  heartbeatInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      trackEvent('heartbeat', { path: window.location.pathname });
    }
  }, 2 * 60 * 1000);
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
