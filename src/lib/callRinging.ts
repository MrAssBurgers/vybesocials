/**
 * Shared ring timeout + terminal call states (declined / missed).
 */
import { db } from '@/lib/firebase';
import { insertCallChatEvent } from '@/lib/callChatMessages';
import type { CallType } from '@/lib/callStore';
import { writeCallSignal } from '@/lib/callSignaling';

export const CALL_RING_TIMEOUT_MS = 30_000;

export interface CallRingContext {
  callId: string;
  conversationId: string;
  callType: CallType;
  callerId: string;
  receiverId: string;
  actorProfileId: string;
}

/** Callee explicitly declined. */
export async function markCallDeclined(ctx: CallRingContext): Promise<void> {
  await db.from('calls').update({ status: 'declined' }).eq('id', ctx.callId);

  void writeCallSignal({
    callId: ctx.callId,
    fromUserId: ctx.actorProfileId,
    toUserId: ctx.callerId,
    signalType: 'declined',
  });

  void insertCallChatEvent({
    conversationId: ctx.conversationId,
    senderId: ctx.actorProfileId,
    kind: 'declined',
    callType: ctx.callType,
    callId: ctx.callId,
  });
}

/** Ring timed out — no answer (callee or caller side). */
export async function markCallMissed(
  ctx: CallRingContext,
  reason: 'timeout' | 'no_answer' = 'timeout',
): Promise<void> {
  const { data: existing } = await db
    .from('calls')
    .select('status')
    .eq('id', ctx.callId)
    .single();

  const status = (existing as { status?: string } | null)?.status;
  if (status && status !== 'ringing') return;

  await db.from('calls').update({ status: 'missed' }).eq('id', ctx.callId);

  void writeCallSignal({
    callId: ctx.callId,
    fromUserId: ctx.actorProfileId,
    toUserId: ctx.receiverId === ctx.actorProfileId ? ctx.callerId : ctx.receiverId,
    signalType: reason === 'timeout' ? 'timeout' : 'missed',
    signalData: { reason },
  });

  const kind = reason === 'no_answer' ? 'no_answer' : 'missed';
  void insertCallChatEvent({
    conversationId: ctx.conversationId,
    senderId: ctx.actorProfileId,
    kind,
    callType: ctx.callType,
    callId: ctx.callId,
  });
}
