import { db } from '@/lib/firebase';
import { removeChannelByTopic } from '@/lib/realtimeChannel';

export interface DmTypingPayload {
  userId: string;
  isTyping: boolean;
  username?: string;
  displayName?: string;
}

export interface DmActivityPayload {
  userId: string;
  activity: 'viewing' | 'typing' | 'recording_voice' | 'recording_video' | 'taking_photo' | 'idle';
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

type BroadcastMessageHandler = (message: Record<string, unknown>) => void;
type BroadcastTypingHandler = (payload: DmTypingPayload) => void;
type BroadcastActivityHandler = (payload: DmActivityPayload) => void;

const messageHandlers = new Map<string, Set<BroadcastMessageHandler>>();
const typingHandlers = new Map<string, Set<BroadcastTypingHandler>>();
const activityHandlers = new Map<string, Set<BroadcastActivityHandler>>();
const subscribedConvos = new Set<string>();
const nativeChannels = new Map<string, BroadcastChannel>();

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

function dispatchActivity(conversationId: string, payload: { payload?: DmActivityPayload }) {
  const data = payload.payload;
  if (!data?.userId) return;
  const handlers = activityHandlers.get(conversationId);
  if (!handlers?.size) return;
  for (const handler of handlers) {
    try {
      handler(data);
    } catch {
      /* noop */
    }
  }
}

function getNativeChannel(conversationId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  let ch = nativeChannels.get(conversationId);
  if (!ch) {
    ch = new BroadcastChannel(channelName(conversationId));
    ch.onmessage = (event: MessageEvent<{ event?: string; payload?: unknown }>) => {
      const { event: evt, payload } = event.data || {};
      if (evt === 'new-message') dispatchMessage(conversationId, { payload: payload as { message?: unknown } });
      if (evt === 'typing') dispatchTyping(conversationId, { payload: payload as DmTypingPayload });
      if (evt === 'activity') dispatchActivity(conversationId, { payload: payload as DmActivityPayload });
    };
    nativeChannels.set(conversationId, ch);
  }
  return ch;
}

function postNative(conversationId: string, event: string, payload: unknown) {
  try {
    getNativeChannel(conversationId)?.postMessage({ event, payload });
  } catch {
    /* noop */
  }
}

function ensureSubscribed(conversationId: string) {
  getNativeChannel(conversationId);
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
    .on('broadcast', { event: 'activity' }, (p: { payload?: DmActivityPayload }) =>
      dispatchActivity(conversationId, p),
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
  dispatchMessage(conversationId, { payload: { message } });
  postNative(conversationId, 'new-message', { message });
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

export function subscribeDmBroadcastActivity(
  conversationId: string,
  handler: BroadcastActivityHandler,
): () => void {
  if (!activityHandlers.has(conversationId)) {
    activityHandlers.set(conversationId, new Set());
  }
  activityHandlers.get(conversationId)!.add(handler);
  ensureSubscribed(conversationId);
  return () => {
    activityHandlers.get(conversationId)?.delete(handler);
  };
}

export async function sendDmBroadcastActivity(
  conversationId: string,
  payload: DmActivityPayload,
): Promise<void> {
  prewarmDmBroadcastChannel(conversationId);
  dispatchActivity(conversationId, { payload });
  postNative(conversationId, 'activity', payload);
  try {
    await db.channel(channelName(conversationId)).send({
      type: 'broadcast',
      event: 'activity',
      payload,
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
  dispatchTyping(conversationId, { payload });
  postNative(conversationId, 'typing', payload);
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
