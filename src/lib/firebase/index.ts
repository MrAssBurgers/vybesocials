import { createDataClient } from './dataClient';

/** Primary Firebase data client — replaces legacy Supabase client. */
export const db = createDataClient();

export { createDataClient };
export type { DataClient } from './dataClient';

// Auth
export { firebaseAuth, getFirebaseAuth, ensureFirebaseAuth, browserPopupRedirectResolver } from './authService';
export type { User, Session } from './authService';
export { getFirebaseAuthDomain, getFirebaseAuthHandlerUrl } from './authDomain';

// Storage
export { firebaseStorage } from './storageService';

// Functions
export {
  invokeFunction,
  getFunctionUrl,
  getFunctionAuthHeaders,
  clearFunctionAuthHeadersCache,
} from './functionsService';

// Messaging (FCM)
export {
  getFirebaseMessaging,
  requestFcmToken,
  onForegroundMessage,
} from './messagingService';

// Realtime
export {
  subscribePostgresChannel,
  removeRealtimeChannel,
  removeChannelByTopic,
} from './realtimeService';
export type { RealtimeChannel } from './realtimeService';

// Domain services
export * from './users';
export * from './posts';
export * from './chats';
export * from './messages';

// Config
export { getFirebaseConfig, isFirebaseConfigured } from './config';
export { getFirebaseApp } from './app';

// App Check
export { initFirebaseAppCheck, isAppCheckInitialized, isAppCheckTokenVerified } from './appCheck';

// Firebase AI Logic
export {
  getFirebaseAI,
  getChatModel,
  getJsonModel,
  isAiLogicConfigured,
  DEFAULT_CHAT_MODEL,
} from './aiLogic';
export {
  captionsResponseSchema,
  commentSuggestionsSchema,
  briefSummarySchema,
  dnaInsightSchema,
  agentPlanSchema,
} from './aiSchemas';
export {
  streamVybeAiChat,
  generateVybeAiImage,
  parseImaginePrompt,
  formatFirebaseAiError,
  filterAiChatHistoryForApi,
  type VybeAiChatMessage,
  type VybeAiChatContext,
} from './aiChat';
