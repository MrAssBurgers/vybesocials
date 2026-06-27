/**
 * Best-effort hardware silent / ringer detection for notification sounds.
 * Native shells (Despia / Capacitor) may expose ringer state via deep links.
 */
import { isDespiaRuntime, despiaCall } from '@/lib/despiaBridge';
import { getSoundSettings } from '@/lib/premiumSounds';

let lastSilentProbe = 0;
let cachedSilent: boolean | null = null;
const PROBE_TTL_MS = 4_000;

export async function isDeviceInSilentMode(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  if (cachedSilent !== null && now - lastSilentProbe < PROBE_TTL_MS) {
    return cachedSilent;
  }

  lastSilentProbe = now;

  if (isDespiaRuntime()) {
    for (const scheme of [
      'checkringerMode://',
      'checkRingermode://',
      'checknativepushpermissions://',
    ]) {
      try {
        const result = await despiaCall(
          scheme,
          ['silent', 'ringerMode', 'ringer_mode', 'nativePushEnabled'],
          450,
        );
        if (!result) continue;
        if (result.silent === true) {
          cachedSilent = true;
          return true;
        }
        const mode = String(result.ringerMode ?? result.ringer_mode ?? '').toLowerCase();
        if (mode === 'silent' || mode === 'vibrate' || mode === 'muted') {
          cachedSilent = true;
          return true;
        }
        if (mode === 'normal' || mode === 'ring') {
          cachedSilent = false;
          return false;
        }
      } catch {
        /* try next scheme */
      }
    }
  }

  cachedSilent = false;
  return false;
}

export async function shouldPlayNotificationSound(category: 'messages' | 'calls' | 'ui' = 'messages'): Promise<boolean> {
  const settings = getSoundSettings();
  if (!settings.master) return false;
  if (category === 'messages' && !settings.messages) return false;
  if (category === 'calls' && !settings.calls) return false;
  if (category === 'ui' && !settings.ui) return false;
  if (await isDeviceInSilentMode()) return false;
  return true;
}

export function invalidateSilentModeCache(): void {
  cachedSilent = null;
  lastSilentProbe = 0;
}
