import { invokeFunction } from './functionsService';

export interface StartDmCallPayload {
  conversationId: string;
  receiverId: string;
  callType: 'audio' | 'video';
  isGroupCall?: boolean;
  callMode?: 'p2p' | 'persistent';
}

export async function startDmCallViaCloudFunction(payload: StartDmCallPayload): Promise<{
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
}> {
  const { data, error } = await invokeFunction<{ call: Record<string, unknown> }>(
    'start-dm-call',
    payload as unknown as Record<string, unknown>,
  ).single();

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to start call', code: error.name } };
  }

  const call = data?.call;
  if (!call?.id) {
    return { data: null, error: { message: 'Invalid server response' } };
  }

  return { data: call, error: null };
}

export function isRetryableCallError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'permission-denied' ||
    /permission|missing or insufficient|could not create call|failed to create call/i.test(
      error.message || '',
    )
  );
}
