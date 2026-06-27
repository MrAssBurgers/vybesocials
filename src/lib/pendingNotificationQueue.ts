import type { NormalizedNotificationPayload } from '@/lib/notificationActions';

const queue: NormalizedNotificationPayload[] = [];
let flusher: ((payload: NormalizedNotificationPayload) => void) | null = null;

export function enqueuePendingNotification(payload: NormalizedNotificationPayload): void {
  if (flusher) {
    flusher(payload);
    return;
  }
  queue.push(payload);
}

export function registerPendingNotificationFlusher(
  handler: (payload: NormalizedNotificationPayload) => void,
): () => void {
  flusher = handler;
  const pending = queue.splice(0, queue.length);
  for (const item of pending) handler(item);
  return () => {
    if (flusher === handler) flusher = null;
  };
}
