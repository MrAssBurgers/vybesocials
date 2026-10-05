import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mapPinFixture } from '@/test/mapPinFixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DiscoveryDrawer } from './DiscoveryDrawer';

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = { friends: [], stories: [], clips: [], meetups: [], places: [], radarLabel: '', onToggle: vi.fn(), onFriendTap: vi.fn(), onMeetupTap: vi.fn(), onPlaceTap: vi.fn() };
it('keeps readable attribution above both the collapsed and expanded friends sheet', () => {
  const attribution = <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>;
  const view = render(<DiscoveryDrawer {...props} open={false} mapAttribution={attribution} />);
  const link = screen.getByRole('link', { name: '© OpenStreetMap contributors' });
  expect(link.closest('[data-map-attribution]')).toHaveClass('absolute', '-top-7', 'bg-white', 'text-slate-900');
  expect(link.closest('[aria-hidden="true"]')).toBeNull();
  expect(link).toBeVisible();
  view.rerender(<DiscoveryDrawer {...props} open mapAttribution={attribution} />);
  expect(screen.getByRole('link', { name: '© OpenStreetMap contributors' })).toBeVisible();
});
it('shows a retriable read failure instead of an empty friends claim', () => {
  const retry = vi.fn();
  render(<DiscoveryDrawer {...props} open={false} friendsError onRetryFriends={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Friend locations could not load');
  expect(screen.queryByText('No active location shares')).toBeNull();
  screen.getByRole('button', { name: 'Retry friend locations' }).click();
  expect(retry).toHaveBeenCalledOnce();
});
it('opens posts and clips with keyboard buttons and describes global approximate areas accurately', async () => {
  const post = mapPinFixture(), clip = mapPinFixture({ id: 'd'.repeat(64), kind: 'clip', sourceType: 'short' }), onContentTap = vi.fn();
  const view = render(<DiscoveryDrawer {...props} open posts={[post]} clips={[clip]} onContentTap={onContentTap} />);
  expect(screen.getByText('Posts on the map')).toBeVisible(); expect(screen.getByText('Clips on the map')).toBeVisible(); expect(screen.queryByText('Clips nearby')).toBeNull();
  const postButton = screen.getByRole('button', { name: /Open post by Alice/ }); postButton.focus(); await userEvent.keyboard('{Enter}');
  expect(onContentTap).toHaveBeenLastCalledWith(post);
  screen.getByRole('button', { name: /Open clip by Alice/ }).focus(); await userEvent.keyboard(' '); expect(onContentTap).toHaveBeenLastCalledWith(clip);
  view.rerender(<DiscoveryDrawer {...props} open={false} posts={[post]} clips={[clip]} onContentTap={onContentTap} />);
  expect(postButton.closest('[inert]')).not.toBeNull();
});
it('allows candidate continuation on an empty page and exposes read failures without claiming no posts exist', () => {
  const more = vi.fn(async () => {}), retry = vi.fn(async () => {});
  const state = { nextGroup: false, windowed: false, restart: vi.fn(async () => {}), isLoading: false, isError: false, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: more, refetch: retry };
  const view = render(<DiscoveryDrawer {...props} open postsState={state} />);
  expect(screen.getByText(/Keep browsing/)).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: /More Posts/i })); expect(more).toHaveBeenCalledOnce();
  view.rerender(<DiscoveryDrawer {...props} open postsState={{ ...state, isError: true }} />);
  expect(screen.queryByText(/No shared content/)).toBeNull(); fireEvent.click(screen.getByRole('button', { name: /Retry Posts/i })); expect(retry).toHaveBeenCalledOnce();
});
