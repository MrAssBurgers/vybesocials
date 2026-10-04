import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'staff-a', epoch: 1, error: false, flags: [] as unknown[], refetch: vi.fn(), update: vi.fn(), path: vi.fn(), navigate: vi.fn(), success: vi.fn(), toastError: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}` } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/hooks/useModeration', () => ({ useContentFlags: () => ({ data: state.flags, isError: state.error, isPending: false, isFetching: false, refetch: state.refetch }), useUpdateFlag: () => ({ mutateAsync: state.update }) }));
vi.mock('@/lib/contentFlagContext', () => ({ hasContentFlagContext: (flag: { content_type: string }) => flag.content_type !== 'message', contentFlagContextPath: (...args: unknown[]) => state.path(...args) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.toastError, message: vi.fn() } }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.uid || epoch !== state.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; }, isReportSessionError: (e: { code?: string }) => e?.code === 'account-changed' }));
import { AdminFlagsSection } from './AdminFlagsSection';
beforeEach(() => { vi.clearAllMocks(); state.uid = 'staff-a'; state.epoch = 1; state.error = false; state.flags = [{ id: 'f', content_type: 'comment', content_id: 'c', flagged_text: 'Legacy detail', status: 'pending', ai_score: 0, created_at: 'invalid' }]; });
afterEach(cleanup);

describe('legacy flags review UI', () => {
  it('shows failed refresh and retry instead of empty or cached flag content', () => {
    state.error = true; render(<AdminFlagsSection />);
    expect(screen.getByRole('alert')).toHaveTextContent('does not mean the queue is empty');
    expect(screen.queryByText('No flags')).not.toBeInTheDocument(); expect(screen.queryByText('Legacy detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry flags' })); expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('labels missing private-message context without claiming the reason is message evidence', () => {
    state.flags = [{ id: 'm', content_type: 'message', content_id: 'private-message', flagged_text: 'harassment', created_at: 'invalid', ai_score: 0 }];
    render(<AdminFlagsSection />);
    expect(screen.getByText(/no verified message snapshot/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Context' })).not.toBeInTheDocument();
    expect(screen.getByText(/AI Score: 0/)).toHaveTextContent('Date unavailable');
    expect(state.path).not.toHaveBeenCalled();
  });
  it.each(['account', 'unmount'])('suppresses a late context lookup after %s', async change => {
    let resolve!: (path: string) => void; state.path.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const page = render(<AdminFlagsSection />); fireEvent.click(screen.getByRole('button', { name: 'View Context' }));
    if (change === 'account') { state.uid = 'staff-b'; state.epoch++; page.rerender(<AdminFlagsSection />); } else page.unmount();
    await act(async () => { resolve('/p/private-previous'); });
    expect(state.navigate).not.toHaveBeenCalled(); expect(state.toastError).not.toHaveBeenCalled();
  });
});
