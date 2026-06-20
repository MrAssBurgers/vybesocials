import { db } from '@/lib/firebase';
import { parseEdgeInvokeResult } from '@/lib/edgeFunctionResponse';

export interface LiveKitCallTokenRequest {
  conversationId: string;
  callType: 'audio' | 'video';
  callId: string;
  receiverId?: string;
  isGroupCall?: boolean;
  participantIds?: string[];
}

export interface LiveKitCallTokenResponse {
  token: string;
  url: string;
  roomName?: string;
}

const DEPLOY_HINT =
  'Calls are unavailable — deploy Firebase Cloud Functions (livekitToken) and set LIVEKIT secrets.';

function isMissingFunctionError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    msg.includes('Failed to send a request') ||
    msg.includes('Failed to fetch') ||
    lower.includes('not found') ||
    lower.includes('not_yet_ported') ||
    lower.includes('404') ||
    lower.includes('failed-precondition')
  );
}

/** Mint a LiveKit token for 1:1 / group DM calls (persistent mode). */
export async function invokeLiveKitCallToken(
  body: LiveKitCallTokenRequest,
): Promise<LiveKitCallTokenResponse> {
  const result = await db.functions.invoke<LiveKitCallTokenResponse & { room?: string }>('livekit-token', { body });
  const { payload, errorCode, errorMessage } = await parseEdgeInvokeResult(result);

  const typed = payload as (LiveKitCallTokenResponse & { room?: string }) | null;
  if (typed?.token && typed?.url) {
    return {
      token: typed.token,
      url: typed.url,
      roomName: typed.roomName || typed.room,
    };
  }

  const msg = errorCode || errorMessage || '';
  if (isMissingFunctionError(msg)) {
    throw new Error(DEPLOY_HINT);
  }

  throw new Error(errorCode || msg || 'Failed to get call token');
}
