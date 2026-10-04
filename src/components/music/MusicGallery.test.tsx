import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
const state = vi.hoisted(() => ({ epoch: 1, publish: vi.fn(), catalog: vi.fn(), success: vi.fn(), error: vi.fn(), play: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, profile: { id: 'profile-a', user_id: 'alice' } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: 'alice', epoch: state.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/musicWriteResults', () => ({ publishMusicPost: state.publish }));
vi.mock('@/lib/musicCatalogService', () => ({ readMusicCatalog: state.catalog }));
vi.mock('@/hooks/useMusicPlayback', () => ({ useMusicPlayback: () => ({ stop: state.stop, toggle: state.play, isPlaying: false, isLoading: false, currentTime: 0, volume: 0.8, setVolume: vi.fn(), error: '' }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { MusicGallery } from './MusicGallery';
const track = { track_id: 'tone', title: 'Synthetic tone', artist: 'QA', genre: 'Effects', duration: 1, preview_url: '/sounds/comment.wav', preview_seconds: 1, artwork_url: null, asset_kind: 'app_sound_effect' };
const page = { tracks: [track], nextCursor: null, unavailableCount: 0 };
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; state.catalog.mockResolvedValue(page); state.publish.mockResolvedValue('post-a'); }); afterEach(cleanup);
describe('honest music catalog and sharing', () => {
  it('loads real checked previews, makes attachment limit clear and requires explicit Play', async () => {
    const selection = vi.fn(); render(<MusicGallery onClose={() => {}} onSelectTrack={selection} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Preview Synthetic tone' })); expect(state.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play preview' })); expect(state.play).toHaveBeenCalledOnce(); expect(selection).not.toHaveBeenCalled();
    expect(screen.getByText(/Adding music to videos is not available/)).toBeTruthy(); expect(screen.queryByText('Use Sound')).toBeNull();
  });
  it('retains close/retry on catalog failure and never fabricates samples', async () => {
    state.catalog.mockRejectedValueOnce(new Error('Music could not be loaded. Please retry.')); render(<MusicGallery onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded'); expect(screen.queryByText('Chill Lofi Beat')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close music gallery' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Retry music' })); expect(await screen.findByText('Synthetic tone')).toBeTruthy();
  });
  it('keeps pagination available for empty filtered pages and deduplicates loaded tracks', async () => {
    state.catalog.mockResolvedValueOnce({ tracks: [], nextCursor: 'page-two', unavailableCount: 25 }); render(<MusicGallery onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more previews' })); expect(await screen.findByText('Synthetic tone')).toBeTruthy(); expect(state.catalog).toHaveBeenLastCalledWith('alice', 'profile-a', 'page-two', expect.any(Function));
  });
  it('confirms only durable post writes, without audio or XP promises', async () => {
    render(<MusicGallery onClose={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Track shared to your feed.')); expect(state.publish).toHaveBeenCalledWith({ author_id: 'profile-a', type: 'post', caption: expect.stringContaining('Synthetic tone') }); expect(state.success.mock.calls.flat().join(' ')).not.toMatch(/XP/);
  });
  it('does not claim failed publication succeeded', async () => {
    state.publish.mockRejectedValueOnce(new Error('Denied')); render(<MusicGallery onClose={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Failed to share track')); expect(state.success).not.toHaveBeenCalled();
  });
  it('ignores a late share result after an A-B-A account change', async () => {
    let resolve!: (value: string) => void; state.publish.mockReturnValue(new Promise<string>(yes => { resolve = yes; }));
    const view = render(<MusicGallery onClose={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed')); state.epoch = 3; view.rerender(<MusicGallery onClose={() => {}} />);
    await act(async () => { resolve('post-a'); }); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
  it('discards late catalog rows after the view closes', async () => {
    let resolve!: (value: typeof page) => void; state.catalog.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const view = render(<MusicGallery onClose={() => {}} />); view.unmount(); await act(async () => { resolve(page); }); expect(screen.queryByText('Synthetic tone')).toBeNull();
  });
  it('traps keyboard focus, closes with Escape and returns focus to its opener', async () => {
    const keyboard = userEvent.setup();
    function Host() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open music</button><button>Behind gallery</button>{open && <MusicGallery onClose={() => setOpen(false)} />}</>; }
    render(<Host />); const opener = screen.getByRole('button', { name: 'Open music' });
    await keyboard.click(opener); const modal = await screen.findByRole('dialog', { name: 'Music Gallery' });
    await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
    for (let index = 0; index < 10; index++) { await keyboard.tab(); expect(modal.contains(document.activeElement)).toBe(true); }
    await keyboard.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it('rejects a cursor cycle and keeps the existing page for recovery', async () => {
    state.catalog.mockResolvedValueOnce({ ...page, nextCursor: 'cursor-a' }).mockResolvedValueOnce({ tracks: [], nextCursor: 'cursor-b', unavailableCount: 0 }).mockResolvedValueOnce({ tracks: [], nextCursor: 'cursor-a', unavailableCount: 0 });
    render(<MusicGallery onClose={() => {}} />); fireEvent.click(await screen.findByRole('button', { name: 'Load more previews' }));
    await waitFor(() => expect(state.catalog).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getByRole('button', { name: 'Load more previews' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Load more previews' })); expect(await screen.findByRole('alert')).toHaveTextContent('pagination could not be verified');
    expect(screen.getByText('Synthetic tone')).toBeTruthy(); expect(state.catalog).toHaveBeenCalledTimes(3);
  });
});
