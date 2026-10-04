import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ entry: {} as any, retry: vi.fn(), navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('./SharedPostPreviews', () => ({ useSharedPostPreview: () => ({ ref: { current: null }, entry: state.entry, retry: state.retry }) }));
import { SharedPostBubble } from './SharedPostBubble';
beforeEach(() => { state.entry = { status: 'unavailable' }; state.retry.mockClear(); state.navigate.mockClear(); });
describe('checked shared-post bubble', () => {
  it('does not render copied message media or navigate when current access is unavailable', () => {
    const stale = { mediaUrl: 'https://example.test/old.png', caption: 'Old private caption', mediaType: 'video' };
    const { container } = render(<SharedPostBubble postId="one" {...stale} />);
    expect(screen.getByText('This post is unavailable.')).toBeInTheDocument();
    expect(container.querySelector('img,video')).toBeNull(); expect(screen.queryByText('Old private caption')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('renders only checked content and removes media after revocation', () => {
    state.entry = { status: 'ready', post: { type: 'post', caption: 'Current caption', mediaUrl: 'https://example.test/current.png', author: { username: 'alice' } } };
    const view = render(<SharedPostBubble postId="one" />);
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://example.test/current.png');
    fireEvent.click(screen.getByRole('button',{ name: 'Open shared post by alice' })); expect(state.navigate).toHaveBeenCalledWith('/p/one');
    state.entry = { status: 'unavailable' }; view.rerender(<SharedPostBubble postId="two" />);
    expect(view.container.querySelector('img,video')).toBeNull(); expect(screen.queryByText('Current caption')).toBeNull();
  });
  it('offers explicit retry without showing old content on failure', () => {
    state.entry = { status: 'error' }; render(<SharedPostBubble postId="one" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' })); expect(state.retry).toHaveBeenCalledOnce();
  });
});
