import { isBlockedByQuietHours, isPushAllowedForType, loadNotificationPreferences } from './pushPreferences.js';

/** Check current preferences immediately before handing a brief to a provider.
 * Read errors propagate, so neither provider nor delivery acknowledgement runs. */
export async function deliverBriefIfAllowed<T>(profileId: string, type: 'brief' | 'daily_brief', send: () => Promise<T>) {
  const preferences = await loadNotificationPreferences(profileId);
  if (!preferences) throw new Error('Notification preferences are unavailable.');
  if (!isPushAllowedForType(type, preferences)) return { skipped: 'preferences' as const };
  if (isBlockedByQuietHours(type, preferences)) return { skipped: 'quiet_hours' as const };
  return { result: await send() };
}
