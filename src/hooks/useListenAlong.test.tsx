import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListenAlong } from './useListenAlong';
import { NowPlayingCard } from '@/components/music/NowPlayingCard';
import { NowPlayingInline } from '@/components/music/NowPlayingInline';
import type { LiveMusicPresence } from './useLiveMusicPresence';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), presence: null as LiveMusicPresence | null }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'viewer-auth-uid' } }) }));
vi.mock('@/hooks/useLiveMusicPresence', () => ({ useLiveMusicPresence: () => mocks.presence }));
vi.mock('@/components/music/LiveSpotifyWaveform', () => ({ LiveSpotifyWaveform: () => null }));
const presence: LiveMusicPresence = {
  user_id: 'friend-auth-uid', provider: 'spotify', track_id: 'track-from-cached-presence', title: 'A song',
  artist: 'An artist', album: null, album_art_url: null, duration_ms: 200000, progress_ms: 30000,
  track_url: null, is_playing: true, tempo: null, energy: null, updated_at: new Date().toISOString(),
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.presence = presence;
  mocks.invoke.mockResolvedValue({ data: { ok: true, listening: true }, error: null });
});
afterEach(cleanup);

describe('listen-along request and response contract', () => {
  it('sends the friend Auth UID and leaves current track and position to the server', async () => {
    const { result } = renderHook(() => useListenAlong());
    await act(async () => result.current.listenAlong(presence));
    expect(mocks.invoke).toHaveBeenCalledWith('spotify-listen-along', { body: { friend_id: 'friend-auth-uid' } });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Listening along 🎧' }));
  });
  it.each([
    [{ ok: false, error: 'friend_not_connected' }, 'Friend’s Spotify is disconnected'],
    [{ ok: false, needs_connect: true }, 'Connect Spotify'],
    [{ ok: false, no_device: true }, 'Open Spotify first'],
    [{ ok: false, needs_reconnect: true }, 'Reconnect Spotify'],
    [{ ok: false, premium_required: true }, 'Spotify Premium required'],
    [{ ok: true, listening: false, error: 'sharing_disabled' }, 'Listening activity is private'],
    [{ ok: true, listening: false }, 'Nothing playing'],
    [{ ok: false }, 'Listen-along failed'],
    [{}, 'Listen-along failed'],
    [null, 'Listen-along failed'],
  ])('never claims successful playback for response %j', async (data, title) => {
    mocks.invoke.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useListenAlong());
    await act(async () => result.current.listenAlong(presence));
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Listening along 🎧' }));
    expect(result.current.loading).toBe(false);
  });
  it('reports callable failure and releases the loading state', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'Not connected as friends' } });
    const { result } = renderHook(() => useListenAlong());
    await act(async () => result.current.listenAlong(presence));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Listen-along failed', description: 'Not connected as friends' }));
    expect(result.current.loading).toBe(false);
  });
  it('rejects missing friend identity and non-Spotify presence before making a request', async () => {
    const { result } = renderHook(() => useListenAlong());
    await act(async () => { await result.current.listenAlong({ ...presence, user_id: '' }); await result.current.listenAlong({ ...presence, provider: 'apple_music' }); });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('ignores duplicate taps while one request is pending', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useListenAlong());
    let first: Promise<void>;
    act(() => { first = result.current.listenAlong(presence); void result.current.listenAlong(presence); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { ok: true, listening: true }, error: null }); await first; });
  });
  it('the profile card uses the shared contract and surfaces domain failures', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, error: 'friend_not_connected' }, error: null });
    render(<NowPlayingCard presence={presence} />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen along' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Friend’s Spotify is disconnected' })));
    expect(mocks.invoke).toHaveBeenCalledWith('spotify-listen-along', { body: { friend_id: presence.user_id } });
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Listening along 🎧' }));
  });
  it('the inline action uses the same friend identity contract', async () => {
    render(<NowPlayingInline authUserId={presence.user_id} />);
    fireEvent.click(screen.getByRole('button', { name: /Listening.*A song/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('spotify-listen-along', { body: { friend_id: presence.user_id } }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Listening along 🎧' })));
  });
});
