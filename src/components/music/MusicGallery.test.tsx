import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ epoch: 1, publish: vi.fn(), usage: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/musicWriteResults', () => ({ publishMusicPost: state.publish, recordMusicUsage: state.usage }));
vi.mock('@/lib/firebase', () => ({ db: {
  auth: { getUser: async () => ({ data: { user: { id: 'uid-a' } } }) },
  from: (table: string) => ({ select: () => table === 'licensed_tracks' ? { order: async () => ({ data: [{ track_id: 'track-a', title: 'Test song', artist: 'Artist', genre: 'Pop', duration: 60, preview_url: '', audio_url: '', provider_id: 'test' }], error: null }) } : table === 'profiles' ? { eq: () => ({ single: async () => ({ data: { id: 'profile-a' }, error: null }) }) } : Promise.resolve({ data: [], error: null }) }),
} }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>, motion: { div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div> } }));
import { MusicGallery } from './MusicGallery';
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; state.publish.mockResolvedValue('post-a'); state.usage.mockResolvedValue(false); });
afterEach(cleanup);
describe('music sharing confirmation', () => {
  it('confirms the published post without XP even when optional counters fail', async () => {
    render(<MusicGallery onClose={() => {}} onSelectTrack={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Track shared to your feed.'));
    expect(screen.getByText(/Music activity counts are unavailable/)).toBeTruthy(); expect(state.error).not.toHaveBeenCalled();
    expect(state.usage).toHaveBeenCalledWith('track-a', 'shares'); expect(state.success.mock.calls.flat().join(' ')).not.toMatch(/XP/);
  });
  it('does not update counts or claim success when the post is refused', async () => {
    state.publish.mockRejectedValueOnce(new Error('Denied')); render(<MusicGallery onClose={() => {}} onSelectTrack={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Failed to share track')); expect(state.success).not.toHaveBeenCalled(); expect(state.usage).not.toHaveBeenCalled();
  });
  it('confirms publication before a stalled counter and ignores its late account result', async () => {
    let resolve!: (value: boolean) => void; state.usage.mockReturnValue(new Promise<boolean>(yes => { resolve = yes; }));
    render(<MusicGallery onClose={() => {}} onSelectTrack={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Track shared to your feed.')); expect(state.usage).toHaveBeenCalled();
    state.epoch = 3; await act(async () => { resolve(false); }); expect(screen.queryByText(/Music activity counts are unavailable/)).toBeNull();
  });
  it('drops a late counter result after unmount', async () => {
    let resolve!: (value: boolean) => void; state.usage.mockReturnValue(new Promise<boolean>(yes => { resolve = yes; }));
    const view = render(<MusicGallery onClose={() => {}} onSelectTrack={() => {}} />); fireEvent.click(await screen.findByTitle('Share to feed'));
    await waitFor(() => expect(state.success).toHaveBeenCalled()); view.unmount(); state.success.mockClear();
    await act(async () => { resolve(false); }); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
});
