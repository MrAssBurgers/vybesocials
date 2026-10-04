import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedPostPreviewProvider, useSharedPostPreview } from './SharedPostPreviews';
import type { SocialPostPreview } from '@/lib/socialFeedService';
const mocks = vi.hoisted(() => ({ account: vi.fn(), read: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => mocks.account() }));
vi.mock('@/lib/socialFeedService', () => ({ readSocialPostPreviews: (...args: unknown[]) => mocks.read(...args) }));
const account = (uid: string, epoch = 1, ready = true) => ({ user: { id: uid }, profile: { id: `${uid}-profile` }, session: { uid, epoch }, ready, guard: vi.fn() });
const post = (caption: string) => ({ id: 'post', caption }) as SocialPostPreview;
function Probe() {
  const { ref, entry } = useSharedPostPreview('post');
  return <div ref={ref} role="status">{entry.post?.caption || entry.status}</div>;
}
function Harness({ conversation = 'chat' }: { conversation?: string }) {
  return <SharedPostPreviewProvider conversationId={conversation}><Probe /></SharedPostPreviewProvider>;
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IntersectionObserver', undefined); mocks.account.mockReturnValue(account('alice')); mocks.read.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(500); });
describe('shared preview React session lifecycle', () => {
  it.each(['account', 'epoch', 'profile', 'conversation', 'not-ready'])('clears mounted content immediately after a %s change', async (change) => {
    mocks.read.mockResolvedValueOnce([post('Alice preview')]);
    const view = render(<Harness />); await tick();
    expect(screen.getByRole('status')).toHaveTextContent('Alice preview');
    const next = account(change === 'account' ? 'bob' : 'alice', change === 'epoch' ? 2 : 1, change !== 'not-ready');
    if (change === 'profile') next.profile.id = 'another-profile';
    mocks.account.mockReturnValue(next); mocks.read.mockResolvedValue([]);
    view.rerender(<Harness conversation={change === 'conversation' ? 'another-chat' : 'chat'} />);
    expect(screen.queryByText('Alice preview')).toBeNull();
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
    expect(mocks.read).toHaveBeenCalledTimes(change === 'not-ready' ? 1 : 2);
  });
  it('ignores a prior account response that finishes after a switch', async () => {
    let resolve!: (posts: SocialPostPreview[]) => void;
    mocks.read.mockImplementationOnce(() => new Promise<SocialPostPreview[]>(done => { resolve = done; }));
    const view = render(<Harness />); await tick();
    mocks.account.mockReturnValue(account('bob')); mocks.read.mockResolvedValue([post('Bob preview')]);
    view.rerender(<Harness />); await tick();
    await act(async () => { resolve([post('Late Alice preview')]); });
    expect(screen.getByRole('status')).toHaveTextContent('Bob preview');
    expect(screen.queryByText('Late Alice preview')).toBeNull();
    expect(mocks.read.mock.calls[1][0]).toMatchObject({ expectedOwnerUid: 'bob', expectedProfileId: 'bob-profile', postIds: ['post'] });
  });
  it('clears on pagehide and requests fresh content on pageshow', async () => {
    mocks.read.mockResolvedValueOnce([post('Before hiding')]).mockResolvedValue([]);
    render(<Harness />); await tick();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(screen.queryByText('Before hiding')).toBeNull();
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});
