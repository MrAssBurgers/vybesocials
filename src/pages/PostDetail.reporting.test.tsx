import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ report: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useSafetyReport', () => ({ useSafetyReport: () => Object.assign(state.report, { sessionKey: 'alice:1:comment-1' }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useModeration', () => ({ useUserRole: () => ({}) }));
vi.mock('@/hooks/useComments', () => ({ useDeleteComment: () => ({ mutate: vi.fn() }), useEditComment: () => ({ mutate: vi.fn() }), useComments: vi.fn(), useCreateComment: vi.fn() }));
vi.mock('@/components/reactions/ReactionPicker', () => ({ ReactionPicker: () => null }));
vi.mock('@/components/moderation/ModeratorActionsMenu', () => ({ useIsModOrAdmin: () => false, ModeratorMenuItems: () => null, ModeratorDialogs: () => null }));
vi.mock('@/components/premium/PremiumMemeBanItems', () => ({ PremiumMemeBanMenuItem: () => null, PremiumMemeBanDialog: () => null }));
vi.mock('@/components/posts/EditPostDialog', () => ({ EditPostDialog: () => null }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: () => null }));
vi.mock('@/components/chat/GifPicker', () => ({ GifPicker: () => null }));
vi.mock('@/components/growth/GuestJoinBanner', () => ({ GuestJoinBanner: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => null }));
vi.mock('@/components/posts/DeleteContentDialog', () => ({ DeleteContentDialog: () => null }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: vi.fn() }));
vi.mock('@/hooks/usePostReaction', () => ({ usePostReaction: vi.fn() }));
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
// Keep the real shared reason/confirmation dialog; the menu simply exposes its item.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
}));
import { CommentActions } from './PostDetail';
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
describe('post detail comment reporting', () => {
  it('requires a confirmed server submission and retains the reason after failure', async () => {
    state.report.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ success: true });
    render(<CommentActions isOwn={false} commentId="comment-1" postId="post-1" commentText="Reported comment" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Harassment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t submit your report');
    expect(screen.getByRole('button', { name: 'Harassment' })).toHaveAttribute('aria-pressed', 'true');
    expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Comment report submitted.'));
    expect(state.report).toHaveBeenNthCalledWith(1, { targetType: 'comment', targetId: 'comment-1', reason: 'harassment' });
    expect(state.report).toHaveBeenNthCalledWith(2, { targetType: 'comment', targetId: 'comment-1', reason: 'harassment' });
  });
  it('does not show another-user reporting on an owned comment', () => {
    render(<CommentActions isOwn commentId="comment-1" postId="post-1" commentText="Mine" />);
    expect(screen.queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
