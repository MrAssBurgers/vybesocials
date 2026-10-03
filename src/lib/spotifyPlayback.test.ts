import { describe, expect, it } from 'vitest';
import { normalizeSpotifyPlaylists, shouldKeepLocalPresence } from './spotifyPlayback';

describe('normalizeSpotifyPlaylists', () => {
  it('maps the raw Spotify items payload', () => {
    const list = normalizeSpotifyPlaylists({
      ok: true,
      items: [
        {
          id: 'pl1',
          name: 'Night Drive',
          images: [{ url: 'https://i.scdn.co/art.jpg' }],
          tracks: { total: 12 },
          owner: { display_name: 'bakrix' },
        },
      ],
    });
    expect(list).toEqual([
      {
        id: 'pl1',
        name: 'Night Drive',
        image: 'https://i.scdn.co/art.jpg',
        tracks: 12,
        owner: 'bakrix',
      },
    ]);
  });

  it('keeps an already mapped playlists array', () => {
    const list = normalizeSpotifyPlaylists({
      playlists: [{ id: 'pl2', name: 'Gym', image: null, tracks: 3, owner: 'me' }],
    });
    expect(list[0]?.id).toBe('pl2');
    expect(list[0]?.tracks).toBe(3);
  });
});

describe('shouldKeepLocalPresence', () => {
  const local = { track_id: 'new', updated_at: '2026-10-03T21:00:10.000Z' };
  const stale = { track_id: 'old', updated_at: '2026-10-03T21:00:02.000Z' };
  const pinUntil = Date.parse('2026-10-03T21:00:20.000Z');
  const duringPin = Date.parse('2026-10-03T21:00:12.000Z');

  it('keeps the local track while a newer skip is pinned', () => {
    expect(shouldKeepLocalPresence(local, stale, pinUntil, duringPin)).toBe(true);
  });

  it('accepts progress for the same track during the pin', () => {
    expect(shouldKeepLocalPresence(
      local,
      { track_id: 'new', updated_at: '2026-10-03T21:00:11.000Z' },
      pinUntil,
      duringPin,
    )).toBe(false);
  });

  it('accepts a remote row once the pin has expired and it is not older', () => {
    expect(shouldKeepLocalPresence(
      local,
      { track_id: 'newer', updated_at: '2026-10-03T21:00:25.000Z' },
      pinUntil,
      Date.parse('2026-10-03T21:00:26.000Z'),
    )).toBe(false);
  });

  it('rejects an older remote song after the pin', () => {
    expect(shouldKeepLocalPresence(
      local,
      stale,
      pinUntil,
      Date.parse('2026-10-03T21:00:30.000Z'),
    )).toBe(true);
  });
});
