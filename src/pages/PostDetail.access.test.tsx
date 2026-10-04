import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ report: vi.fn(), success: vi.fn(), error: vi.fn(), entry: { status: 'unavailable', expires: 0 } as { status: string; expires: number; post?: Record<string, unknown> }, retry: vi.fn(), comments: vi.fn(() => ({ data: [], isLoading: false })) }));
vi.mock('@/hooks/useSafetyReport', () => ({ useSafetyReport: () => Object.assign(state.report, { sessionKey: 'alice:1:comment-1' }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useModeration', () => ({ useUserRole: () => ({}) }));
vi.mock('@/hooks/useComments', () => ({ useDeleteComment: () => ({ mutate: vi.fn() }), useEditComment: () => ({ mutate: vi.fn() }), useComments: state.comments, useCreateComment: () => ({ mutate: vi.fn() }) }));
vi.mock('@/components/reactions/ReactionPicker', () => ({ ReactionPicker: () => null }));
vi.mock('@/components/moderation/ModeratorActionsMenu', () => ({ useIsModOrAdmin: () => false, ModeratorMenuItems: () => null, ModeratorDialogs: () => null }));
vi.mock('@/components/premium/PremiumMemeBanItems', () => ({ PremiumMemeBanMenuItem: () => null, PremiumMemeBanDialog: () => null }));
vi.mock('@/components/posts/EditPostDialog', () => ({ EditPostDialog: () => null }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/chat/GifPicker', () => ({ GifPicker: () => null }));
vi.mock('@/components/growth/GuestJoinBanner', () => ({ GuestJoinBanner: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => null }));
vi.mock('@/components/posts/DeleteContentDialog', () => ({ DeleteContentDialog: () => null }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: vi.fn() }));
vi.mock('@/hooks/usePostReaction', () => ({ usePostReaction: () => ({ currentReaction: null, likeCount: 0, handleReaction: vi.fn() }) }));
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));

vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: false, session: { uid: 'alice', epoch: 1 } }) }));
vi.mock('@/components/chat/SharedPostPreviews', () => ({
  SharedPostPreviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActivePostPreview: () => ({ entry: state.entry, retry: state.retry }),
}));
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostDetail from './PostDetail';
function mount() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/p/one']}><Routes><Route path="/p/:id" element={<PostDetail />} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); state.entry = { status: 'unavailable', expires: 0 }; });
afterEach(cleanup);
describe('post detail access states', () => {
  it('does not request comments or show post media for denied content', () => {
    const view = mount();
    expect(screen.getByText('This post is unavailable')).toBeInTheDocument();
    expect(view.container.querySelector('img,video')).toBeNull();
    expect(state.comments.mock.calls[0][0]).toBe('');
  });
  it('offers a real retry after an authority failure', () => {
    state.entry.status = 'error'; mount();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it('renders an admitted text post without a broken-media placeholder', () => {
    state.entry = { status: 'ready', expires: 30000, post: { id: 'one', type: 'post', caption: 'Current text post', tags: [], createdAt: '2026-10-04T12:00:00.000Z', mediaUrl: null, likeCount: 0, commentCount: 0, author: { id: 'bob', username: 'bob', avatarUrl: null, displayName: 'Bob' } } };
    const view = mount();
    expect(screen.getByText('Current text post')).toBeInTheDocument();
    expect(view.container.querySelector('video')).toBeNull();
    expect(state.comments.mock.calls[0][0]).toBe('one');
  });
});
