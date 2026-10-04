// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>() }));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const snapshot = (path: string) => {
    const data = structuredClone(state.rows.get(path));
    return { id: path.split('/').at(-1)!, exists: data !== undefined, data: () => data };
  };
  const query = (name: string, filters: Array<[string, unknown]> = [], limit = Infinity) => ({
    where: (field: string, op: string, value: unknown) => {
      if (op !== '==') throw new Error('Unexpected query operator');
      return query(name, [...filters, [field, value]], limit);
    },
    limit: (count: number) => query(name, filters, count),
    get: async () => {
      const docs = [...state.rows.entries()].filter(([path, row]) => path.startsWith(`${name}/`) && filters.every(([field, value]) => row[field] === value))
        .slice(0, limit).map(([path]) => snapshot(path));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    auth: {},
    requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw new Error('Sign in required'); return request.auth.uid; },
    db: { collection: (name: string) => ({ ...query(name), doc: (id: string) => ({
      get: async () => snapshot(`${name}/${id}`),
      update: async (patch: Row) => { state.rows.set(`${name}/${id}`, { ...state.rows.get(`${name}/${id}`), ...patch }); },
    }) }) },
  };
});
import { spotifyListenAlong } from '../../functions/src/spotify';

const CALLER = 'viewer-auth';
const FRIEND = 'friend-auth';
const CALLER_PROFILE = 'viewer-profile';
const FRIEND_PROFILE = 'friend-profile';
const TRACK = `spotify:track:${'A'.repeat(22)}`;
const NP = 'https://api.spotify.com/v1/me/player/currently-playing';
const PLAY = 'https://api.spotify.com/v1/me/player/play';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const song = { is_playing: true, progress_ms: 12345, item: { uri: TRACK, duration_ms: 180000, name: 'Server-confirmed track' } };
const json = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers });
const connection = (user: string) => ({ user_id: user, access_token: `access-${user}`, refresh_token: `refresh-${user}`, expires_at: new Date(Date.now() + 3600000).toISOString() });
const request = (extra = {}) => ({ auth: { uid: CALLER, token: {} }, data: { friend_id: FRIEND, ...extra }, rawRequest: {} });
const run = (extra = {}) => spotifyListenAlong.run(request(extra) as Parameters<typeof spotifyListenAlong.run>[0]);
const friend = (sender = CALLER_PROFILE, receiver = FRIEND_PROFILE, deterministic = false) => {
  state.rows.set(`friend_requests/${deterministic ? `${sender}_${receiver}` : 'legacy-random-id'}`, { sender_id: sender, receiver_id: receiver, status: 'accepted' });
};
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  state.rows.clear();
  for (const [uid, profile] of [[CALLER, CALLER_PROFILE], [FRIEND, FRIEND_PROFILE]]) {
    state.rows.set(`profiles/${profile}`, { user_id: uid });
    state.rows.set(`user_auth_index/${uid}`, { profile_id: profile });
    state.rows.set(`spotify_connections/${uid}`, connection(uid));
  }
  friend();
  fetcher = vi.fn<typeof fetch>(async url => {
    if (url === NP) return json(song);
    if (url === PLAY) return new Response(null, { status: 204 });
    throw new Error('Unexpected external request');
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const playbackCalls = () => fetcher.mock.calls.filter(([url]) => url === PLAY);

describe('Listen Along relationship and privacy boundary', () => {
  it.each([
    [CALLER, FRIEND, false], [FRIEND, CALLER, false],
    [CALLER_PROFILE, FRIEND_PROFILE, true], [FRIEND_PROFILE, CALLER_PROFILE, false],
    [CALLER, FRIEND_PROFILE, false], [CALLER_PROFILE, FRIEND, false],
  ])('accepts existing UID/profile friendship %s -> %s', async (sender, receiver, deterministic) => {
    state.rows.delete('friend_requests/legacy-random-id'); friend(sender, receiver, deterministic);
    await expect(run()).resolves.toMatchObject({ ok: true, listening: true });
    expect(playbackCalls()).toHaveLength(1);
  });
  it('resolves migrated profile IDs when the auth index has not been backfilled', async () => {
    state.rows.delete(`user_auth_index/${CALLER}`); state.rows.delete(`user_auth_index/${FRIEND}`);
    await expect(run()).resolves.toMatchObject({ listening: true });
  });
  it('rejects missing authentication, invalid targets, and self-listening before Spotify', async () => {
    await expect(spotifyListenAlong.run({ data: { friend_id: FRIEND } } as Parameters<typeof spotifyListenAlong.run>[0])).rejects.toThrow('Sign in');
    for (const friend_id of ['', ' ', '../profile', '\u0000', 'x'.repeat(129), 3, null, {}]) {
      await expect(run({ friend_id })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    await expect(run({ friend_id: CALLER })).resolves.toMatchObject({ ok: false, error: 'cannot_listen_along_self' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['none', 'pending', 'declined', 'close-friend-only'])('denies %s without an accepted friendship', async status => {
    state.rows.delete('friend_requests/legacy-random-id');
    if (status === 'close-friend-only') state.rows.set('close_friends/self-added', { owner_id: CALLER, user_id: CALLER_PROFILE, friend_id: FRIEND });
    else if (status !== 'none') state.rows.set('friend_requests/legacy-random-id', { sender_id: CALLER_PROFILE, receiver_id: FRIEND_PROFILE, status });
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [CALLER, FRIEND], [FRIEND, CALLER], [CALLER_PROFILE, FRIEND_PROFILE], [FRIEND_PROFILE, CALLER_PROFILE],
    [CALLER, FRIEND_PROFILE], [FRIEND_PROFILE, CALLER], [CALLER_PROFILE, FRIEND], [FRIEND, CALLER_PROFILE],
  ])('denies a block from %s to %s despite accepted friendship', async (blocker, blocked) => {
    state.rows.set('blocked_users/random-block-id', { blocker_id: blocker, blocked_id: blocked });
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [FRIEND, FRIEND, 'show_listening_activity'], [FRIEND_PROFILE, FRIEND_PROFILE, 'show_in_dms'],
    ['legacy-settings-uid', FRIEND, 'show_in_dms'], ['legacy-settings-profile', FRIEND_PROFILE, 'show_listening_activity'],
  ])('respects private music settings in %s', async (id, userId, field) => {
    state.rows.set(`music_settings/${id}`, { user_id: userId, [field]: false });
    await expect(run()).resolves.toMatchObject({ ok: true, listening: false, error: 'sharing_disabled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not override an explicit private legacy preference with a public canonical row', async () => {
    state.rows.set(`music_settings/${FRIEND_PROFILE}`, { user_id: FRIEND_PROFILE, show_in_dms: true });
    state.rows.set('music_settings/older-private', { user_id: FRIEND, show_in_dms: false });
    await expect(run()).resolves.toMatchObject({ listening: false, error: 'sharing_disabled' });
  });
  it('fails closed when duplicate settings exceed the bounded read', async () => {
    for (let index = 0; index < 11; index++) state.rows.set(`music_settings/duplicate-${index}`, { user_id: FRIEND_PROFILE, show_in_dms: true });
    await expect(run()).resolves.toMatchObject({ listening: false, error: 'sharing_disabled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['block', 'unfriend', 'privacy'])('honors a %s while Spotify is responding, before playback', async change => {
    fetcher.mockImplementation(async url => {
      if (url !== NP) throw new Error('Must not start playback');
      if (change === 'block') state.rows.set('blocked_users/late-block', { blocker_id: FRIEND_PROFILE, blocked_id: CALLER_PROFILE });
      if (change === 'unfriend') state.rows.delete('friend_requests/legacy-random-id');
      if (change === 'privacy') state.rows.set(`music_settings/${FRIEND_PROFILE}`, { user_id: FRIEND_PROFILE, show_listening_activity: false });
      return json(song);
    });
    if (change === 'privacy') await expect(run()).resolves.toMatchObject({ listening: false, error: 'sharing_disabled' });
    else await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(playbackCalls()).toHaveLength(0);
  });
});

describe('Listen Along Spotify response contract', () => {
  it.each([200, 204])('confirms playback only for successful HTTP %s', async status => {
    fetcher.mockImplementation(async url => url === NP ? json(song) : new Response(null, { status }));
    const result = await run({ track_id: 'caller-forged-track', position_ms: 99999 });
    expect(result).toMatchObject({ ok: true, listening: true });
    const [, options] = playbackCalls()[0];
    expect(JSON.parse(String(options?.body))).toEqual({ uris: [TRACK], position_ms: 12345 });
    expect(options).toMatchObject({ method: 'PUT', redirect: 'error' });
    expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer access-${CALLER}`);
  });
  it.each([
    [401, {}, { needs_reconnect: true }],
    [403, { error: { message: 'Premium required' } }, { premium_required: true }],
    [403, { error: { message: 'Scope missing private-provider-data' } }, { error: 'Spotify denied playback permission. Reconnect Spotify and try again.' }],
    [404, {}, { no_device: true }],
    [429, {}, { retry_after_seconds: 20 }],
    [500, {}, { error: 'Spotify is temporarily unavailable. Please try again later.' }],
    [503, {}, { error: 'Spotify is temporarily unavailable. Please try again later.' }],
  ])('does not report playback success after Spotify HTTP %s', async (status, body, expected) => {
    fetcher.mockImplementation(async url => url === NP ? json(song) : json(body, status, { 'Retry-After': '20' }));
    const result = await run();
    expect(result).toMatchObject({ ok: false, listening: false, ...expected });
    expect(JSON.stringify(result)).not.toContain('private-provider-data');
    expect(JSON.stringify(result)).not.toContain('access-');
    expect(playbackCalls()).toHaveLength(1);
  });
  it.each([401, 403, 404, 429, 500, 503])('does not play after friend Spotify HTTP %s', async status => {
    fetcher.mockResolvedValue(json({ error: 'private-provider-data' }, status, { 'Retry-After': '10' }));
    const result = await run();
    expect(result).toMatchObject({ ok: false, listening: false });
    if ([401, 403].includes(status)) expect(result).toMatchObject({ error: 'friend_not_connected' });
    if (status === 429) expect(result).toMatchObject({ retry_after_seconds: 10 });
    expect(JSON.stringify(result)).not.toContain('private-provider-data');
    expect(playbackCalls()).toHaveLength(0);
  });
  it.each([
    null, { is_playing: true }, { ...song, is_playing: false },
    { ...song, item: { uri: 'spotify:local:local-file' } }, { ...song, item: { uri: 'https://evil.example/track' } },
  ])('does not start unavailable or paused media %j', async current => {
    fetcher.mockResolvedValue(current === null ? new Response(null, { status: 204 }) : json(current));
    await expect(run()).resolves.toMatchObject({ ok: true, listening: false });
    expect(playbackCalls()).toHaveLength(0);
  });
  it('reports malformed Spotify JSON without leaking it', async () => {
    fetcher.mockResolvedValue(new Response('secret-provider-body', { status: 200 }));
    const result = await run();
    expect(result).toMatchObject({ ok: false, listening: false });
    expect(JSON.stringify(result)).not.toContain('secret-provider');
    expect(playbackCalls()).toHaveLength(0);
  });
  it.each([NP, PLAY])('handles a network failure at %s', async failureUrl => {
    fetcher.mockImplementation(async url => { if (url === failureUrl) throw new Error('request contained private-token'); return json(song); });
    const result = await run();
    expect(result).toMatchObject({ ok: false, listening: false });
    expect(JSON.stringify(result)).not.toContain('private-token');
  });
  it.each([-5, 500000])('bounds the server-reported position %s to the song', async progress => {
    fetcher.mockImplementation(async url => url === NP ? json({ ...song, progress_ms: progress }) : new Response(null, { status: 204 }));
    await run();
    expect(JSON.parse(String(playbackCalls()[0][1]?.body)).position_ms).toBe(progress < 0 ? 0 : 180000);
  });
});

describe('Listen Along connection and refresh compatibility', () => {
  it.each([FRIEND, CALLER])('reports the missing connection for %s before external requests', async missing => {
    state.rows.delete(`spotify_connections/${missing}`);
    await expect(run()).resolves.toMatchObject(missing === FRIEND ? { error: 'friend_not_connected' } : { needs_connect: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses existing migrated connection documents discovered by their user_id', async () => {
    for (const uid of [CALLER, FRIEND]) {
      state.rows.delete(`spotify_connections/${uid}`);
      state.rows.set(`spotify_connections/legacy-${uid}`, connection(uid));
    }
    await expect(run()).resolves.toMatchObject({ listening: true });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe(`Bearer access-${FRIEND}`);
  });
  it('refreshes expired connection documents and uses the refreshed tokens for read and playback', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'mock-client'); vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'mock-secret');
    for (const uid of [CALLER, FRIEND]) state.rows.set(`spotify_connections/${uid}`, { ...connection(uid), expires_at: new Date(0).toISOString() });
    fetcher.mockImplementation(async (url, options) => {
      if (url === TOKEN_URL) {
        const refreshToken = new URLSearchParams(String(options?.body)).get('refresh_token');
        return json({ access_token: `renewed-${refreshToken}`, expires_in: 3600 });
      }
      return url === NP ? json(song) : new Response(null, { status: 204 });
    });
    await expect(run()).resolves.toMatchObject({ listening: true });
    expect(fetcher.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(2);
    expect(new Headers(fetcher.mock.calls.find(([url]) => url === NP)?.[1]?.headers).get('Authorization')).toBe(`Bearer renewed-refresh-${FRIEND}`);
    expect(new Headers(playbackCalls()[0][1]?.headers).get('Authorization')).toBe(`Bearer renewed-refresh-${CALLER}`);
    expect(state.rows.get(`spotify_connections/${CALLER}`)?.access_token).toBe(`renewed-refresh-${CALLER}`);
  });
  it.each([FRIEND, CALLER])('reports a refresh rejection for %s without exposing provider details', async expired => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'mock-client'); vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'mock-secret');
    state.rows.set(`spotify_connections/${expired}`, { ...connection(expired), expires_at: new Date(0).toISOString() });
    fetcher.mockResolvedValue(new Response('secret-refresh-details', { status: 400 }));
    const result = await run();
    expect(result).toMatchObject(expired === FRIEND ? { error: 'friend_not_connected' } : { needs_reconnect: true });
    expect(JSON.stringify(result)).not.toContain('secret-refresh-details');
    expect(playbackCalls()).toHaveLength(0);
  });
});
