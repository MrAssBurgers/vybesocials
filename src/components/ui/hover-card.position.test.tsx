import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

let anchorTop = 60;
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, top: y, left: x, width, height, bottom: y + height, right: x + width, toJSON: () => ({}) });
beforeEach(() => {
  anchorTop = 60;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.testid === 'feed' ? 100 : 720; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'trigger') return rect(120, anchorTop, 96, 32);
    if (this.dataset.testid === 'preview' || this.hasAttribute('data-radix-popper-content-wrapper')) return rect(0, 0, 320, 240);
    return rect(0, 0, 1024, 720);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'preview' || this.hasAttribute('data-radix-popper-content-wrapper') ? 320 : this.dataset.testid === 'trigger' ? 96 : 1024;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'preview' || this.hasAttribute('data-radix-popper-content-wrapper') ? 240 : this.dataset.testid === 'trigger' ? 32 : 720;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Example({ open = true }: { open?: boolean }) {
  return <div data-testid="feed" style={{ overflow: 'hidden', transform: 'translateY(0)', height: 100 }}>
    <HoverCard open={open}>
      <HoverCardTrigger data-testid="trigger" href="#profile">Person</HoverCardTrigger>
      <HoverCardContent data-testid="preview" side="top" align="start" sideOffset={8} style={{ width: 320, zIndex: 9999 }}>
        <div>Profile banner</div><button>View profile</button>
      </HoverCardContent>
    </HoverCard>
  </div>;
}
describe('profile hover viewport placement', () => {
  it('portals outside a clipped, transformed feed and preserves the overlay layer', async () => {
    render(<Example />);
    const preview = await screen.findByTestId('preview');
    expect(screen.getByTestId('feed').contains(preview)).toBe(false);
    expect(document.body.contains(preview)).toBe(true);
    expect(preview.parentElement).toHaveAttribute('data-radix-popper-content-wrapper');
    await waitFor(() => expect(preview.parentElement?.style.position).toBe('fixed'));
    expect(preview.parentElement?.style.zIndex).toBe('9999');
    expect(screen.getByRole('button', { name: 'View profile' })).toBeDefined();
  });
  it('flips below an avatar near the top edge and remains above one near the bottom', async () => {
    const view = render(<Example />);
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveAttribute('data-side', 'bottom'));
    view.unmount(); anchorTop = 660;
    render(<Example />);
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveAttribute('data-side', 'top'));
  });
  it('updates placement when the page scrolls and bounds content to available viewport space', async () => {
    render(<Example />);
    const preview = await screen.findByTestId('preview');
    await waitFor(() => expect(preview).toHaveAttribute('data-side', 'bottom'));
    anchorTop = 650;
    await act(async () => { fireEvent.scroll(window); });
    await waitFor(() => expect(preview).toHaveAttribute('data-side', 'top'));
    expect(preview.style.maxWidth).toBe('var(--radix-hover-card-content-available-width)');
    expect(preview.style.maxHeight).toBe('var(--radix-hover-card-content-available-height)');
    expect(preview.style.overflowY).toBe('auto');
    expect(preview.style.overscrollBehavior).toBe('contain');
  });
  it('removes the portaled preview when the hover closes', async () => {
    const view = render(<Example />); await screen.findByText('Profile banner');
    view.rerender(<Example open={false} />);
    await waitFor(() => expect(screen.queryByText('Profile banner')).toBeNull());
  });
  it('hides the floating preview when its trigger scrolls out of a clipping container', async () => {
    render(<Example />);
    const preview = await screen.findByTestId('preview');
    await waitFor(() => expect(preview.parentElement?.style.visibility).not.toBe('hidden'));
    anchorTop = -50;
    await act(async () => { fireEvent.scroll(screen.getByTestId('feed')); });
    await waitFor(() => expect(preview.parentElement?.style.visibility).toBe('hidden'));
    expect(preview.parentElement?.style.pointerEvents).toBe('none');
  });
});
