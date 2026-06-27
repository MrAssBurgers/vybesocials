import { sendPushNotification } from '@/lib/pushNotifications';

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 10_000;

/** Snapchat-style "X is typing…" push — rate-limited per conversation + recipient. */
export function notifyPeerTyping(opts: {
  recipientProfileId: string;
  senderName: string;
  conversationId: string;
}): void {
  const { recipientProfileId, senderName, conversationId } = opts;
  if (!recipientProfileId || !conversationId) return;

  const key = `${conversationId}:${recipientProfileId}`;
  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) return;
  lastSent.set(key, now);

  void sendPushNotification({
    userId: recipientProfileId,
    title: senderName || 'Someone',
    body: `${senderName || 'Someone'} is typing…`,
    url: `/messages/${conversationId}`,
    tag: `vybe-typing-${conversationId}`,
    type: 'typing',
    data: {
      conversationId,
      path: `/messages/${conversationId}`,
      typing: 'true',
    },
  }).catch(() => {});
}
