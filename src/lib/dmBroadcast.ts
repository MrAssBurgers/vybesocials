import { db } from '@/lib/firebase';
import { removeChannelByTopic } from '@/lib/realtimeChannel';

export interface DmTypingPayload {
  userId: string;
  isTyping: boolean;
  username?: string;
  displayName?: string;
}

type BroadcastMessageHandler = (message: Record<string, unknown>) => void;
type BroadcastTypingHandler = (payload: DmTypingPayload) => void;

const messageHandlers = new Map<string, Set<BroadcastMessageHandler>>();
const typingHandlers = new Map<string, Set<BroadcastTypingHandler>>();
const subscribedConvos = new Set<string>();

function channelName(conversationId: string) {
  return `dm-broadcast:${conversationId}`;
}

function dispatchMessage(conversationId: string, payload: { payload?: { message?: unknown } }) {
  const msg = payload.payload?.message;
  if (!msg || typeof msg !== 'object') return;
  const handlers = messageHandlers.get(conversationId);
  if (!handlers?.size) return;
  for (const handler of handlers) {
    try {
      handler(msg as Record<string, unknown>);
    } catch {
      /* noop */
    }
  }
}

function dispatchTyping(conversationId: string, payload: { payload?: DmTypingPayload }) {
  const data = payload.payload;
  if (!data?.userId) return;
  const handlers = typingHandlers.get(conversationId);
  if (!handlers?.size) return;
  for (const handler of handlers) {
    try {
      handler(data);
    } catch {
      /* noop */
    }
  }
}

function ensureSubscribed(conversationId: string) {
  if (subscribedConvos.has(conversationId)) return;
  subscribedConvos.add(conversationId);
  removeChannelByTopic(channelName(conversationId));
  db.channel(channelName(conversationId))
    .on('broadcast', { event: 'new-message' }, (p: { payload?: { message?: unknown } }) =>
      dispatchMessage(conversationId, p),
    )
    .on('broadcast', { event: 'typing' }, (p: { payload?: DmTypingPayload }) =>
      dispatchTyping(conversationId, p),
    )
    .subscribe();
}

export function prewarmDmBroadcastChannel(conversationId: string | undefined) {
  if (!conversationId) return;
  ensureSubscribed(conversationId);
}

export function subscribeDmBroadcastMessages(
  conversationId: string,
  handler: BroadcastMessageHandler,
): () => void {
  if (!messageHandlers.has(conversationId)) {
    messageHandlers.set(conversationId, new Set());
  }
  messageHandlers.get(conversationId)!.add(handler);
  ensureSubscribed(conversationId);
  return () => {
    messageHandlers.get(conversationId)?.delete(handler);
  };
}

export function subscribeDmBroadcastTyping(
  conversationId: string,
  handler: BroadcastTypingHandler,
): () => void {
  if (!typingHandlers.has(conversationId)) {
    typingHandlers.set(conversationId, new Set());
  }
  typingHandlers.get(conversationId)!.add(handler);
  ensureSubscribed(conversationId);
  return () => {
    typingHandlers.get(conversationId)?.delete(handler);
  };
}

export async function sendDmBroadcastMessage(
  conversationId: string,
  message: Record<string, unknown>,
): Promise<void> {
  prewarmDmBroadcastChannel(conversationId);
  try {
    await db.channel(channelName(conversationId)).send({
      type: 'broadcast',
      event: 'new-message',
      payload: { message },
    });
  } catch {
    /* best-effort */
  }
}

export async function sendDmBroadcastTyping(
  conversationId: string,
  payload: DmTypingPayload,
): Promise<void> {
  prewarmDmBroadcastChannel(conversationId);
  try {
    await db.channel(channelName(conversationId)).send({
      type: 'broadcast',
      event: 'typing',
      payload,
    });
  } catch {
    /* best-effort */
  }
}
