import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipsGrid } from './ClipsGrid';

vi.mock('./ShortCard', () => ({ ShortCard: ({ post }: { post: { id: string; caption: string } }) => <div data-testid="playing-clip">{post.id}: {post.caption}</div> }));
vi.mock('@/components/ui/VideoThumbnail', () => ({ VideoThumbnail: ({ alt }: { alt: string }) => <img alt={alt} /> }));

const clip = (id: string, caption: string) => ({ id, caption, media_url: 'https://example.test/clip.mp4', tags: [], author: { id: 'alice', username: 'alice', avatar_url: null }, like_count: 0, comment_count: 0, is_liked: false, is_bookmarked: false });
const clips = [clip('one', 'A first clip'), clip('two', 'A second clip'), clip('three', '')];
afterEach(() => { cleanup(); document.body.style.overflow = ''; });

describe('profile clip viewer', () => {
  it('opens from a named keyboard control outside the transformed profile and closes with Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(<div style={{ transform: 'translateZ(0)' }}><ClipsGrid clips={clips} /></div>);
    const opener = screen.getByRole('button', { name: 'Play clip: A first clip' });
    opener.focus(); await user.keyboard('{Enter}');
    const viewer = screen.getByRole('dialog', { name: 'Profile clips' });
    expect(container).not.toContainElement(viewer);
    expect(within(viewer).getByTestId('playing-clip')).toHaveTextContent('one: A first clip');
    expect(within(viewer).getByRole('button', { name: 'Close clips' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(viewer).getByRole('button', { name: 'Next clip' })).toHaveFocus();
    await user.tab();
    expect(within(viewer).getByRole('button', { name: 'Close clips' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('keeps the selected clip when data reorders and closes when that clip disappears', async () => {
    const user = userEvent.setup();
    const view = render(<ClipsGrid clips={clips} />);
    await user.click(screen.getByRole('button', { name: 'Play clip: A second clip' }));
    view.rerender(<ClipsGrid clips={[clips[1], clips[0]]} />);
    expect(screen.getByTestId('playing-clip')).toHaveTextContent('two: A second clip');
    view.rerender(<ClipsGrid clips={[clips[0]]} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerender(<ClipsGrid clips={clips} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets keyboard users change clips and gives untitled clips a useful label', async () => {
    const user = userEvent.setup(); render(<ClipsGrid clips={clips} />);
    expect(screen.getByRole('button', { name: 'Play clip 3 by @alice' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play clip: A first clip' }));
    const viewer = within(screen.getByRole('dialog', { name: 'Profile clips' }));
    expect(viewer.getByRole('button', { name: 'Previous clip' })).toBeDisabled();
    viewer.getByRole('button', { name: 'Next clip' }).focus(); await user.keyboard(' ');
    expect(viewer.getByTestId('playing-clip')).toHaveTextContent('two: A second clip');
    await user.click(viewer.getByRole('button', { name: 'Previous clip' }));
    expect(viewer.getByTestId('playing-clip')).toHaveTextContent('one: A first clip');
  });

  it('restores the previous scroll lock when the viewer unmounts', async () => {
    const user = userEvent.setup(); document.body.style.overflow = 'scroll';
    const view = render(<ClipsGrid clips={clips} />);
    // The image click also exercises the original mouse-only entry point.
    await user.click(screen.getByRole('img', { name: 'A first clip' }));
    view.unmount();
    await waitFor(() => expect(document.body.style.overflow).toBe('scroll'));
  });

  it('preserves swipe navigation without passing the ends of the current clip list', async () => {
    const user = userEvent.setup(); render(<ClipsGrid clips={clips} />);
    await user.click(screen.getByRole('button', { name: 'Play clip: A second clip' }));
    const viewer = screen.getByRole('dialog', { name: 'Profile clips' });
    const swipe = (from: number, to: number) => {
      fireEvent.touchStart(viewer, { touches: [{ clientX: 100, clientY: from }], changedTouches: [{ clientX: 100, clientY: from }] });
      fireEvent.touchEnd(viewer, { touches: [], changedTouches: [{ clientX: 100, clientY: to }] });
    };
    swipe(500, 200); expect(screen.getByTestId('playing-clip')).toHaveTextContent('three:');
    swipe(500, 200); expect(screen.getByTestId('playing-clip')).toHaveTextContent('three:');
    swipe(200, 500); expect(screen.getByTestId('playing-clip')).toHaveTextContent('two:');
    fireEvent.touchStart(viewer, { touches: [{ clientX: 100, clientY: 500 }], changedTouches: [{ clientX: 100, clientY: 500 }] }); fireEvent.touchCancel(viewer);
    fireEvent.touchEnd(viewer, { changedTouches: [{ clientY: 200 }] });
    expect(screen.getByTestId('playing-clip')).toHaveTextContent('two:');
  });
});
