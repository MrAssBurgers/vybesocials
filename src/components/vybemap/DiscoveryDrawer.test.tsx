import { cleanup, render, screen } from '@testing-library/react';
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
