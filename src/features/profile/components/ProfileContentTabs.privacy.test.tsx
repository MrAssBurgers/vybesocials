import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => { const epoch = state.session.epoch; return { ready: true, user: { id: 'alice' }, profile: { id: 'a' }, session: state.session, guard: () => { if (epoch !== state.session.epoch) throw new Error('Account changed'); } }; } }));
vi.mock('@/lib/socialPostListService', () => ({ readSocialPostList: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/components/ui/VideoThumbnail', () => ({ VideoThumbnail: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock('./ProfileCoverHero', () => ({ formatProfileStat: String }));
import { ProfileContentTabs } from './ProfileContentTabs';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); state.read.mockResolvedValue({ posts: [], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30000 }); });
afterEach(() => { cleanup(); client.clear(); });
describe('profile tabs request only authorized content', () => {
  it('defaults to no queries and disabled tabs', () => {
    render(<ProfileContentTabs profileId="target" />, { wrapper }); expect(state.read).not.toHaveBeenCalled();
    for (const name of ['Posts', 'Clips', 'Tagged']) expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByText('Content not shared')).toBeInTheDocument();
  });
  it('fetches permitted clips without also reading hidden posts or tags', async () => {
    render(<ProfileContentTabs profileId="target" canViewClips />, { wrapper });
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    expect(state.read.mock.calls[0][0]).toEqual({ expectedOwnerUid: 'alice', expectedProfileId: 'a', scope: 'profile', targetId: 'target', contentType: 'short' });
    expect(await screen.findByRole('button', { name: 'Posts' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Tagged' })).toBeDisabled();
  });
  it('removes old content immediately when permission is revoked', async () => {
    state.read.mockResolvedValue({ posts: [{ id: 'clip', type: 'short', caption: 'Private clip', media_url: 'media' }], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30000 });
    const view = render(<ProfileContentTabs profileId="target" canViewClips />, { wrapper });
    await screen.findByText('Private clip'); view.rerender(<ProfileContentTabs profileId="target" />);
    expect(screen.queryByText('Private clip')).not.toBeInTheDocument();
  });
  it('shows a retry error, never an empty content claim, after a failed read', async () => {
    state.read.mockRejectedValueOnce(new Error('permission-denied'));
    render(<ProfileContentTabs profileId="target" canViewClips />, { wrapper });
    await screen.findByText('Content could not be loaded.'); expect(screen.queryByText('No clips yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry content' })); await screen.findByText('No clips yet');
  });
});
