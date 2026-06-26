import { isAndroidUA, isIOSUA } from '@/lib/despiaBridge';

/** User-facing path when OS notification permission is denied. */
export function pushBlockedSettingsMessage(): string {
  if (isAndroidUA()) {
    return 'Notifications are blocked. Open Settings → Apps → VYBE → Notifications and turn them on.';
  }
  if (isIOSUA()) {
    return 'Notifications are blocked. Open Settings → VYBE → Notifications and turn them on.';
  }
  return 'Notifications are blocked. Enable them in your device settings.';
}

/** Hint when OneSignal has not linked this device yet. */
export function pushNotLinkedHint(): string {
  if (isAndroidUA()) {
    return 'Toggle push off and on, tap Allow on the Android prompt, then wait a few seconds before testing again.';
  }
  return 'Toggle push off and on, tap Allow when prompted, then try again.';
}

/** Extra context when local Despia push worked but server delivery failed. */
export function despiaLocalHint(deliveryError: string): string | undefined {
  if (deliveryError.includes('not registered') || deliveryError.includes('not linked')) {
    return 'You may have seen a local test notification. Toggle push off/on, allow permission, wait ~10s, then test again for server delivery.';
  }
  return pushNotLinkedHint();
}
