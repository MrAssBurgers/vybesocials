import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ save: vi.fn(), publish: vi.fn(), success: vi.fn(), error: vi.fn(), navigate: vi.fn(), epoch: 1 }));
vi.mock('@/lib/musicWriteResults', () => ({ saveMusicPersonality: state.save, publishMusicPost: state.publish }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => { const epoch = state.epoch; return { user: { id: 'alice' }, profile: { id: 'profile-a', user_id: 'alice' }, session: { uid: 'alice', epoch }, guard: () => { if (state.epoch !== epoch) throw new Error('Account changed'); } }; } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>, motion: { div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div> } }));
import MusicPersonalityQuiz from './MusicPersonalityQuiz';
function finishQuiz() { render(<MusicPersonalityQuiz />); for (let step = 0; step < 8; step++) fireEvent.click(screen.getAllByRole('button')[0]); }
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; state.save.mockResolvedValue(undefined); state.publish.mockResolvedValue('post-a'); });
afterEach(cleanup);
describe('music quiz result confirmation', () => {
  it('retains the result with an explicit retry when persistence fails', async () => {
    state.save.mockRejectedValueOnce(new Error('Save refused')); finishQuiz();
    await screen.findByRole('alert'); expect(screen.getByText('Save refused')).toBeTruthy(); expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving result' })); await waitFor(() => expect(state.success).toHaveBeenCalledWith('Music personality saved.'));
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByRole('button', { name: 'Share to Feed' })).toBeTruthy();
  });
  it('never advertises XP and only confirms a successful publication', async () => {
    finishQuiz(); await waitFor(() => expect(state.save).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: 'Share to Feed' }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Shared to your feed.')); expect(state.navigate).toHaveBeenCalledWith('/');
    expect(state.success.mock.calls.flat().join(' ')).not.toMatch(/XP/); expect(screen.queryByText(/50 XP/)).toBeNull();
  });
  it('failed sharing keeps the result open without a success or navigation', async () => {
    state.publish.mockRejectedValueOnce(new Error('Post refused')); finishQuiz(); await waitFor(() => expect(state.save).toHaveBeenCalled()); state.success.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Share to Feed' })); await waitFor(() => expect(state.error).toHaveBeenCalledWith('Failed to share results'));
    expect(state.success).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Share to Feed' })).not.toBeDisabled();
  });
  it('does not navigate, toast or change a new account after a late publish completion', async () => {
    let resolve!: (value: string) => void; state.publish.mockReturnValueOnce(new Promise<string>(yes => { resolve = yes; }));
    finishQuiz(); await waitFor(() => expect(state.save).toHaveBeenCalled()); state.success.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Share to Feed' }));
    expect(state.publish).toHaveBeenCalledWith(expect.objectContaining({ author_id: 'profile-a' }), expect.any(Function));
    state.epoch += 2; await act(async () => { resolve('post-a'); });
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled();
  });

});
