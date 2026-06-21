/**
 * Firestore call_signals — audit trail for invite lifecycle (ring → accept/decline/missed).
 * Complements the `calls` row; used for debugging delivery and wake-up timing.
 */
import { db } from '@/lib/firebase';

export type CallSignalType =
  | 'invite'
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'missed'
  | 'timeout'
  | 'ended'
  | 'connected';

export interface CallSignalPayload {
  callId: string;
  fromUserId: string;
  toUserId: string;
  signalType: CallSignalType;
  signalData?: Record<string, unknown>;
}

export async function writeCallSignal(payload: CallSignalPayload): Promise<void> {
  const row = {
    call_id: payload.callId,
    from_user_id: payload.fromUserId,
    to_user_id: payload.toUserId,
    signal_type: payload.signalType,
    signal_data: {
      ...(payload.signalData || {}),
      ts: new Date().toISOString(),
    },
  };

  try {
    const { error } = await db.from('call_signals').insert(row);
    if (error && import.meta.env.DEV) {
      console.warn('[callSignaling] insert failed:', error.message);
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[callSignaling] insert error:', err);
  }

  if (import.meta.env.DEV) {
    console.info('[callSignaling]', payload.signalType, payload.callId);
  }
}
