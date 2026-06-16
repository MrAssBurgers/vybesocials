/**
 * Stubs for not-yet-ported functions. After Phase 7 the remaining stubs are
 * niche or third-party-blocked (Runway video, music provider sync, AR-only
 * features). Real implementations live in their domain modules.
 */
import { onCall, onRequest } from 'firebase-functions/v2/https';

function pending(name: string) {
  return onCall(async () => ({
    ok: false, error: 'not_yet_ported', function: name,
    message: `'${name}' has no Firebase implementation yet.`,
  }));
}

function pendingHttp(name: string) {
  return onRequest({ cors: true }, async (_req, res) => {
    res.status(501).json({ ok: false, error: 'not_yet_ported', function: name });
  });
}

// Runway video (requires RUNWAY_API_KEY + polling — port when needed)
export const generateRunwayVideo = pending('generate-runway-video');
export const checkRunwayStatus = pending('check-runway-status');

// Music provider sync (low-priority — Spotify is the real path now)
export const syncMusicProviders = pending('sync-music-providers');
export const testMusicProvider = pending('test-music-provider');
export const uploadSound = pending('upload-sound');

// Auth email hook (Firebase Auth handles its own templates — port if customized)
export const authEmailHook = pending('auth-email-hook');

// Streak notifier (placeholder until scheduled fn is wired)
export const notifyExpiringStreaks = pending('notify-expiring-streaks');
