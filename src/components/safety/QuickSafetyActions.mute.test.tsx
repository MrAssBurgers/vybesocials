import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as { profileId: string; uid: string }[], mute: vi.fn(), unmute: vi.fn(), undo: vi.fn(), success: vi.fn(), report: vi.fn(), block: vi.fn(), current: true, ready: true }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'alice-profile' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock('@/lib/blockUserSafety', () => ({ blockUserAndNotifyModeration: state.block }));
vi.mock('@/hooks/useSafetyReport', () => ({ useSafetyReport: () => Object.assign(state.report, { sessionKey: 'alice:1', isCurrent: () => state.current }) }));
vi.mock('@/lib/reportModerationService', () => ({ isReportSessionError: (error: { code?: string }) => error?.code === 'account-changed' }));
vi.mock('@/hooks/useFeedMutes', () => ({ useFeedMuteActions: () => ({ rows: state.rows, ready: state.ready, isError: false, mute: state.mute, unmute: state.unmute, undo: state.undo, guard: vi.fn(), assertCurrent: () => { if (!state.current) throw Object.assign(new Error('Changed'), { code: 'account-changed' }); }, isCurrent: () => state.current }) }));
import { QuickSafetyActions } from './QuickSafetyActions';

beforeEach(() => { state.rows = []; state.current = true; state.ready = true; for (const mock of [state.mute, state.unmute, state.undo, state.success, state.report, state.block]) mock.mockReset(); state.mute.mockResolvedValue({ profileId: 'bob-profile', uid: 'bob' }); state.undo.mockResolvedValue(undefined); });
afterEach(cleanup);
const open = () => { const component = render(<QuickSafetyActions targetUserId="bob-profile" targetUsername="bob" />); fireEvent.click(screen.getByRole('button', { name: 'Mute in feeds' })); return component; };

describe('real feed mute confirmation', () => {
  it('does not announce an unmuted state while saved preferences are still loading', () => {
    state.ready = false; render(<QuickSafetyActions targetUserId="bob-profile" targetUsername="bob" />);
    fireEvent.click(screen.getByRole('button', { name: 'Feed mute settings' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading your saved feed mutes');
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Feed mute settings' })).toBeDisabled();
  });
  it('waits for a saved mute before announcing success and offers undo without a report/block', async () => {
    let resolve!: (row: unknown) => void; state.mute.mockReturnValue(new Promise(done => { resolve = done; })); const component = open();
    const dialog = screen.getByRole('alertdialog'); expect(within(dialog).getByText(/Messages and notifications stay unchanged/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mute in feeds' })); expect(state.success).not.toHaveBeenCalled();
    await act(async () => { resolve({ profileId: 'bob-profile', uid: 'bob' }); });
    expect(state.success).toHaveBeenCalledWith('@bob is muted in your feeds.', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    component.unmount(); await act(async () => { state.success.mock.calls[0][1].action.onClick(); });
    expect(state.undo).toHaveBeenCalledWith('bob-profile'); expect(state.report).not.toHaveBeenCalled(); expect(state.block).not.toHaveBeenCalled();
  });
  it('keeps the confirmation open and retryable when saving fails', async () => {
    state.mute.mockRejectedValue(new Error('Offline')); open();
    await act(async () => { fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mute in feeds' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('not saved'); expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(state.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mute in feeds' })).toBeEnabled();
  });
  it('suppresses a success completion after the target/session changed', async () => {
    let resolve!: (row: unknown) => void; state.mute.mockReturnValue(new Promise(done => { resolve = done; })); open();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mute in feeds' })); state.current = false;
    await act(async () => { resolve({ profileId: 'bob-profile', uid: 'bob' }); }); expect(state.success).not.toHaveBeenCalled();
  });
});
