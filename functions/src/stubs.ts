/**
 * Stubs for not-yet-ported Supabase edge functions.
 *
 * These exist so the client can still call them during the cutover without
 * crashing on "function not found". Each returns a structured "not_yet_ported"
 * payload so callers can degrade gracefully. Phase 6 will sweep client call
 * sites and either delete the stub or wire a real implementation here.
 */
import { onCall, onRequest } from 'firebase-functions/v2/https';

function pending(name: string) {
  return onCall(async () => ({
    ok: false,
    error: 'not_yet_ported',
    function: name,
    message: `'${name}' is queued for Phase 6 of the Firebase migration.`,
  }));
}

function pendingHttp(name: string) {
  return onRequest({ cors: true }, async (_req, res) => {
    res.status(501).json({ ok: false, error: 'not_yet_ported', function: name });
  });
}

// AI extras (most port to Phase 6 once Gemini direct + Lovable gateway are wired in detail)
export const aiAdaptiveResponse = pending('ai-adaptive-response');
export const aiAutoFix = pending('ai-auto-fix');
export const aiDetectText = pending('ai-detect-text');
export const aiEnhancePhoto = pending('ai-enhance-photo');
export const adminAiBuilder = pending('admin-ai-builder');
export const adminDebugTools = pending('admin-debug-tools');
export const analyzeBugReport = pending('analyze-bug-report');
export const analyzeError = pending('analyze-error');
export const briefTopicDetail = pending('brief-topic-detail');
export const dnaAutopilot = pending('dna-autopilot');
export const dnaAutopilotRevert = pending('dna-autopilot-revert');
export const generateAiVideo = pending('generate-ai-video');
export const generateArFilter = pending('generate-ar-filter');
export const generateChallenges = pending('generate-challenges');
export const generateCustomAnimations = pending('generate-custom-animations');
export const generatePwaIcon = pending('generate-pwa-icon');
export const generateRunwayVideo = pending('generate-runway-video');
export const checkRunwayStatus = pending('check-runway-status');
export const prewarmDailyBriefs = pending('prewarm-daily-briefs');
export const smartBriefPings = pending('smart-brief-pings');
export const smartPingDispatcher = pending('smart-ping-dispatcher');
export const vybeAgent = pending('vybe-agent');
export const vybeCommander = pending('vybe-commander');

// Auth/passkey/email extras
export const authEmailHook = pending('auth-email-hook');
export const authPasskeyLoginOptions = pending('auth-passkey-login-options');
export const authPasskeyLoginVerify = pending('auth-passkey-login-verify');
export const authPasskeyRegisterOptions = pending('auth-passkey-register-options');
export const authPasskeyRegisterVerify = pending('auth-passkey-register-verify');
export const sendAuthEmail = pending('send-auth-email');
export const sendResetEmail = pending('send-reset-email');
export const sendTransactionalEmail = pending('send-transactional-email');
export const previewTransactionalEmail = pending('preview-transactional-email');
export const handleEmailSuppression = pending('handle-email-suppression');
export const handleEmailUnsubscribe = pendingHttp('handle-email-unsubscribe');
export const processEmailQueue = pending('process-email-queue');

// Commerce — Stripe Connect / checkout / tip / payout (Phase 6: port with stripe-node)
export const checkCreatorConnect = pending('check-creator-connect');
export const checkStripeConnect = pending('check-stripe-connect');
export const createBusinessCheckout = pending('create-business-checkout');
export const createCheckoutSession = pending('create-checkout-session');
export const createCreatorConnect = pending('create-creator-connect');
export const createPremiumCheckout = pending('create-premium-checkout');
export const createStripeConnect = pending('create-stripe-connect');
export const createStripeDashboardLink = pending('create-stripe-dashboard-link');
export const createTip = pending('create-tip');
export const connectV2AccountLink = pending('connect-v2-account-link');
export const connectV2AccountStatus = pending('connect-v2-account-status');
export const connectV2BillingPortal = pending('connect-v2-billing-portal');
export const connectV2Checkout = pending('connect-v2-checkout');
export const connectV2CreateAccount = pending('connect-v2-create-account');
export const connectV2CreateProduct = pending('connect-v2-create-product');
export const connectV2ListProducts = pending('connect-v2-list-products');
export const connectV2Subscription = pending('connect-v2-subscription');
export const connectV2WebhookSubscriptions = pendingHttp('connect-v2-webhook-subscriptions');
export const connectV2WebhookThin = pendingHttp('connect-v2-webhook-thin');
export const stripeWebhook = pendingHttp('stripe-webhook');
export const processCreatorPayout = pending('process-creator-payout');
export const validateStripeConfig = pending('validate-stripe-config');

// Spotify / music
export const spotifyControl = pending('spotify-control');
export const spotifyDisconnect = pending('spotify-disconnect');
export const spotifyListenAlong = pending('spotify-listen-along');
export const spotifyNowPlaying = pending('spotify-now-playing');
export const spotifyOauthCallback = pendingHttp('spotify-oauth-callback');
export const spotifyOauthStart = pendingHttp('spotify-oauth-start');
export const spotifyPlaylists = pending('spotify-playlists');
export const syncMusicProviders = pending('sync-music-providers');
export const testMusicProvider = pending('test-music-provider');
export const uploadSound = pending('upload-sound');
