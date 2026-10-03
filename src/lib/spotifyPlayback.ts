import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';

export const SPOTIFY_REFRESH_EVENT = 'vybe:spotify-refresh';

export interface SpotifyPlaylistRow {
  id: string;
  name: string;
  image: string | null;
  tracks: number;
  owner: string;
}

export interface SpotifyRefreshDetail {
  /** Track that was showing before this skip, so a stale poll can be retried. */
  previousTrackId?: string | null;
  /** now-playing payload returned inline by spotify-control, when the server has it. */
  nowPlaying?: Record<string, unknown> | null;
  expectTrackChange?: boolean;
}

export function requestSpotifyRefresh(detail: SpotifyRefreshDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SPOTIFY_REFRESH_EVENT, { detail }));
}

export function readSpotifyRefreshDetail(event: Event): SpotifyRefreshDetail {
  const detail = (event as CustomEvent<SpotifyRefreshDetail>).detail;
  return detail && typeof detail === 'object' ? detail : {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function playlistImage(item: Record<string, unknown>): string | null {
  if (typeof item.image === 'string' && item.image) return item.image;
  const images = item.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = asRecord(images[0]);
    if (first && typeof first.url === 'string') return first.url;
  }
  return null;
}

function playlistTracks(item: Record<string, unknown>): number {
  if (typeof item.tracks === 'number' && Number.isFinite(item.tracks)) return item.tracks;
  const tracks = asRecord(item.tracks);
  if (tracks && typeof tracks.total === 'number') return tracks.total;
  return 0;
}

function playlistOwner(item: Record<string, unknown>): string {
  if (typeof item.owner === 'string') return item.owner;
  const owner = asRecord(item.owner);
  if (owner && typeof owner.display_name === 'string') return owner.display_name;
  return '';
}

/** Accept `{ playlists: [...] }` and the raw Spotify `{ items: [...] }` body. */
export function normalizeSpotifyPlaylists(data: unknown): SpotifyPlaylistRow[] {
  const root = asRecord(data);
  if (!root) return [];
  const raw = Array.isArray(root.playlists)
    ? root.playlists
    : Array.isArray(root.items)
      ? root.items
      : [];
  const out: SpotifyPlaylistRow[] = [];
  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item || typeof item.id !== 'string' || !item.id) continue;
    out.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name ? item.name : 'Playlist',
      image: playlistImage(item),
      tracks: playlistTracks(item),
      owner: playlistOwner(item),
    });
  }
  return out;
}

function timeMs(value: string | null | undefined): number {
  if (!value) return NaN;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * While a fresh Spotify poll is pinned, a slower Firestore row must not
 * put the previous song back on screen.
 */
export function shouldKeepLocalPresence(
  local: Pick<LiveMusicPresence, 'track_id' | 'updated_at'> | null,
  remote: Pick<LiveMusicPresence, 'track_id' | 'updated_at'> | null,
  pinUntil: number,
  now: number,
): boolean {
  if (!local) return false;
  if (now < pinUntil) {
    if (!remote) return true;
    return (remote.track_id ?? null) !== (local.track_id ?? null);
  }
  if (!remote) return false;
  const localAt = timeMs(local.updated_at);
  const remoteAt = timeMs(remote.updated_at);
  if (Number.isFinite(localAt) && Number.isFinite(remoteAt) && remoteAt + 1500 < localAt) {
    return (remote.track_id ?? null) !== (local.track_id ?? null);
  }
  return false;
}

let fastPollCount = 0;
const fastPollListeners = new Set<() => void>();

export function spotifyPollIntervalMs(): number {
  return fastPollCount > 0 ? 3500 : 8000;
}

export function subscribeSpotifyPollInterval(listener: () => void): () => void {
  fastPollListeners.add(listener);
  return () => fastPollListeners.delete(listener);
}

/** Mini player open → poll the signed-in track every few seconds. */
export function retainSpotifyFastPoll(): () => void {
  fastPollCount += 1;
  fastPollListeners.forEach((listener) => listener());
  return () => {
    fastPollCount = Math.max(0, fastPollCount - 1);
    fastPollListeners.forEach((listener) => listener());
  };
}
