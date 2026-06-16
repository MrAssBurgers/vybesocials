import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from './app';
import { getFirebaseConfig } from './config';
import { firebaseAuth } from './authService';
import type { FunctionInvokeResult, VybeAuthError } from './types';

/** Map legacy Supabase edge function names → Firebase callable export names. */
const FUNCTION_NAME_MAP: Record<string, string> = {
  'ai-chat': 'aiChat',
  'livekit-token': 'livekitToken',
  'send-push-notification': 'sendPushNotification',
  'get-ranked-feed': 'getRankedFeed',
  'get_ranked_feed_v2': 'getRankedFeed',
  'share-preview': 'sharePreview',
  'giphy-search': 'giphySearch',
  'detect-ai-content': 'detectAiContent',
  'ai-catch-up': 'aiChat',
  'community-voice-token': 'livekitToken',
  'spaces-token': 'livekitToken',
  'generate-advanced-theme': 'aiChat',
  'generate-theme': 'aiChat',
  'generate-ar-filter': 'aiChat',
  'dna-chat': 'aiChat',
  'dna-autopilot': 'aiChat',
  'dna-autopilot-revert': 'aiChat',
  'vybe-agent': 'aiChat',
  'unsend-message': 'aiChat',
  'link-onesignal-user': 'sendPushNotification',
  'mute-smart-pings': 'sendPushNotification',
  'phone-verify-request': 'aiChat',
  'phone-verify-confirm': 'aiChat',
  'auth-2fa-preauth': 'aiChat',
  'auth-2fa-verify': 'aiChat',
  'auth-qr': 'aiChat',
  'check-debug-secrets': 'aiChat',
  'analyze-bug-report': 'aiChat',
  'check-runway-status': 'aiChat',
  'generate-runway-video': 'aiChat',
  'fetch-pixabay-sounds': 'giphySearch',
  'spotify-control': 'giphySearch',
  'spotify-listen-along': 'giphySearch',
  'spotify-now-playing': 'giphySearch',
  'spotify-playlists': 'giphySearch',
  'spotify-disconnect': 'giphySearch',
  'create-checkout-session': 'aiChat',
  'create-premium-checkout': 'aiChat',
  'create-business-checkout': 'aiChat',
  'create-stripe-connect': 'aiChat',
  'create-creator-connect': 'aiChat',
  'check-stripe-connect': 'aiChat',
  'check-creator-connect': 'aiChat',
  'create-stripe-dashboard-link': 'aiChat',
  'process-creator-payout': 'aiChat',
  'validate-stripe-config': 'aiChat',
  'handle-email-unsubscribe': 'aiChat',
  'admin-debug-tools': 'aiChat',
  'ai-auto-fix': 'aiChat',
  'auth-login-notify': 'sendPushNotification',
  'rate-sticker-content': 'detectAiContent',
  'scan-video-safety': 'detectAiContent',
};

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    const { functionsRegion } = getFirebaseConfig();
    functionsInstance = getFunctions(getFirebaseApp(), functionsRegion);
  }
  return functionsInstance;
}

function toError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string };
    return { message: e.message || 'Function error', name: e.code };
  }
  return { message: 'Function error' };
}

/** Invoke a Cloud Function (replaces Supabase edge functions.invoke). */
export function invokeFunction<T = any>(
  name: string,
  body?: Record<string, unknown>,
): Promise<FunctionInvokeResult<T>> & {
  single: () => Promise<FunctionInvokeResult<T>>;
  maybeSingle: () => Promise<FunctionInvokeResult<T>>;
} {
  const callableName = FUNCTION_NAME_MAP[name] || name;
  const promise = (async () => {
    try {
      const fn = httpsCallable<Record<string, unknown> | undefined, T>(
        getFunctionsInstance(),
        callableName,
      );
      const result = await fn(body);
      return { data: result.data, error: null } as FunctionInvokeResult<T>;
    } catch (err) {
      return { data: null, error: toError(err) } as FunctionInvokeResult<T>;
    }
  })();
  const enriched = promise as Promise<FunctionInvokeResult<T>> & {
    single: () => Promise<FunctionInvokeResult<T>>;
    maybeSingle: () => Promise<FunctionInvokeResult<T>>;
  };
  enriched.single = () => promise;
  enriched.maybeSingle = () => promise;
  return enriched;
}

export function getFunctionUrl(functionName: string): string {
  const { projectId, functionsRegion } = getFirebaseConfig();
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/${functionName}`;
}

export async function getFunctionAuthHeaders(
  contentType = 'application/json',
): Promise<Record<string, string>> {
  const { data: { session } } = await firebaseAuth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');
  return {
    'Content-Type': contentType,
    Authorization: `Bearer ${accessToken}`,
  };
}

export function clearFunctionAuthHeadersCache(): void {
  // Firebase tokens refresh automatically; no-op for API compatibility.
}
