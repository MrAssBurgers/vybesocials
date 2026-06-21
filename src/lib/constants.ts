// App version
export const APP_VERSION = '1.1.5';

// Feature flags
export const FEATURES = {
  AI_ENABLED: true,
  AI_FREE: true, // All AI features are free
  CALLS_ENABLED: true,
  COMMUNITIES_ENABLED: true,
  MARKETPLACE_ENABLED: true,
  EVENTS_ENABLED: true,
} as const;

// Presence settings
export const PRESENCE = {
  ONLINE_THRESHOLD_MS: 45 * 1000, // ~3 missed heartbeats
  HEARTBEAT_INTERVAL_MS: 15 * 1000, // 15 seconds — Snapchat-style
  TYPING_TIMEOUT_MS: 3000, // 3 seconds
} as const;

// Realtime settings
export const REALTIME = {
  MESSAGE_NOTIFICATION_DEBOUNCE_MS: 100,
  SUBSCRIPTION_RETRY_DELAY_MS: 1000,
} as const;
