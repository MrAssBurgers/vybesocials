/** Prevent duplicate in-app toasts / sounds within a short window (same tag). */
const recent = new Map<string, number>();
const WINDOW_MS = 30_000;

export function shouldShowInAppNotification(tag: string): boolean {
  const now = Date.now();
  const prev = recent.get(tag);
  if (prev && now - prev < WINDOW_MS) return false;
  recent.set(tag, now);
  if (recent.size > 200) {
    for (const [k, t] of recent) {
      if (now - t > WINDOW_MS) recent.delete(k);
    }
  }
  return true;
}

export function dmNotificationTag(conversationId: string, messageId: string): string {
  return `dm:${conversationId}:${messageId}`;
}

export function bellNotificationTag(type: string, id: string): string {
  return `bell:${type}:${id}`;
}
