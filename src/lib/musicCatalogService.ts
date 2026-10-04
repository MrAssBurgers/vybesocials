import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard } from '@/lib/reportModerationService';

export interface MusicPreview {
  track_id: string; title: string; artist: string; genre: string; duration: number;
  preview_url: string; preview_seconds: number; artwork_url: string | null;
  asset_kind: 'app_sound_effect' | 'music_preview';
}
export interface MusicCatalogPage { tracks: MusicPreview[]; nextCursor: string | null; unavailableCount: number }
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
export function safeAudioSource(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  if (/^\/sounds\/(dm-received|dm-sent|post-liked|share-post|comment|call-ring|vybe-notification)\.wav$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password
      && /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(url.hostname)
      && !/(^|\.)(localhost|local|internal|lan|home|invalid|test)$/.test(url.hostname); } catch { return false; }
}
export async function readMusicCatalog(uid: string, profileId: string, cursor?: string, viewGuard?: () => void): Promise<MusicCatalogPage> {
  const account = reportAccountGuard(uid);
  const guard = () => { account(); viewGuard?.(); if (!uid || !profileId) throw new Error('Wait for your account to load.'); };
  guard();
  const { data, error } = await invokeFunction<Record<string, unknown>>('read-music-catalog', { expectedOwnerUid: uid, expectedProfileId: profileId, ...(cursor ? { cursor } : {}) });
  guard();
  if (error) throw new Error('Music could not be loaded. Please retry.');
  if (!data || data.ownerUid !== uid || data.profileId !== profileId || !Array.isArray(data.tracks) || data.tracks.length > 25
    || !(data.nextCursor === null || (text(data.nextCursor, 128) && !data.nextCursor.includes('/') && data.nextCursor !== cursor))
    || !Number.isSafeInteger(data.unavailableCount) || Number(data.unavailableCount) < 0 || Number(data.unavailableCount) > 25) throw new Error('Music catalog could not be verified. Please retry.');
  const tracks = data.tracks as MusicPreview[];
  if (tracks.some(track => !track || !text(track.track_id, 128) || track.track_id.includes('/') || !text(track.title, 160) || !text(track.artist, 160) || !text(track.genre, 60)
    || !safeAudioSource(track.preview_url) || !Number.isFinite(track.duration) || track.duration <= 0 || !Number.isFinite(track.preview_seconds) || track.preview_seconds <= 0 || track.preview_seconds > 30
    || (track.preview_url.startsWith('/') && track.asset_kind !== 'app_sound_effect') || track.preview_seconds > track.duration || track.duration > 86400
    || !['app_sound_effect', 'music_preview'].includes(track.asset_kind) || !(track.artwork_url === null || (typeof track.artwork_url === 'string' && track.artwork_url.startsWith('https://') && safeAudioSource(track.artwork_url))))
    || new Set(tracks.map(track => track.track_id)).size !== tracks.length) throw new Error('Music catalog could not be verified. Please retry.');
  return { tracks, nextCursor: data.nextCursor as string | null, unavailableCount: Number(data.unavailableCount) };
}
