/**
 * MouthZoom Bridge - Allows triggering mouth zoom animation from outside React context
 * Used by notification handlers that can't access React hooks
 */

type MouthZoomTrigger = (
  rect: DOMRect,
  userId: string,
  username: string,
  avatarUrl: string | null,
  displayName: string | null,
) => Promise<void>;

let registeredTrigger: MouthZoomTrigger | null = null;

export function registerMouthZoomTrigger(trigger: MouthZoomTrigger) {
  registeredTrigger = trigger;
}

export function unregisterMouthZoomTrigger() {
  registeredTrigger = null;
}

export function triggerMouthZoom(
  rect: DOMRect,
  userId: string,
  username: string,
  avatarUrl: string | null,
  displayName: string | null,
): Promise<void> {
  if (!registeredTrigger) {
    console.warn('[MouthZoom] No trigger registered');
    return Promise.resolve();
  }
  return registeredTrigger(rect, userId, username, avatarUrl, displayName);
}

export function isMouthZoomAvailable(): boolean {
  return registeredTrigger !== null;
}
