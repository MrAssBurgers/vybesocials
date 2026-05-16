/**
 * Offline indicator disabled by design — the app should always appear online.
 * Cached content keeps displaying when offline; we just don't surface any
 * "you're offline" UI. New content simply won't load until connectivity returns.
 */
export function OfflineIndicator() {
  return null;
}
