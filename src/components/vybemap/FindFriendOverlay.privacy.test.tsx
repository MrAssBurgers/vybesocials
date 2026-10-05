import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: state.haptic }));
vi.mock('@/hooks/useFastSignedUrl', () => ({ useFastSignedUrl: () => null }));
vi.mock('@/lib/vybemap/deviceHeading', () => ({ subscribeDeviceHeading: () => () => {} }));
import { FindFriendOverlay } from './FindFriendOverlay';
import { FriendCardSheet } from './FriendCardSheet';
import type { LiveFriend } from '@/lib/vybemap/types';
const friend = (precise = false): LiveFriend => ({ id: 'bob', user_id: 'bob', latitude: 30, longitude: -97, label: 'Bob', sharing_enabled: true, sharing_mode: precise ? 'precise' : 'approximate', approx_radius_m: precise ? 0 : 2000, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30000).toISOString(), profile: { username: 'Bob', display_name: null, avatar_url: null } });
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('approximate locations do not claim pinpoint arrival', () => {
  it('labels the area and suppresses arrival/haptics at the coarse cell center', () => {
    const found = vi.fn(); render(<FindFriendOverlay friend={friend()} myCoords={[30, -97]} onClose={() => {}} onFound={found} />);
    expect(screen.getByText(/does not reveal an exact position/)).toBeInTheDocument(); expect(screen.queryByText('Arrived')).not.toBeInTheDocument(); expect(screen.queryByText('Right nearby')).not.toBeInTheDocument(); expect(found).not.toHaveBeenCalled(); expect(state.haptic).not.toHaveBeenCalled();
  });
  it('keeps the existing precise-position arrival behavior', () => {
    const found = vi.fn(); render(<FindFriendOverlay friend={friend(true)} myCoords={[30, -97]} onClose={() => {}} onFound={found} />);
    expect(screen.getByText('Arrived')).toBeInTheDocument(); expect(found).toHaveBeenCalledOnce();
  });
  it('offers finding the shared area rather than an exact location on the card', () => {
    render(<FriendCardSheet friend={friend()} myCoords={[30, -97]} onClose={() => {}} onMessage={() => {}} onNavigate={() => {}} onFind={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole('button', { name: 'Find shared area' })).toBeInTheDocument(); expect(screen.queryByText('Pinpoint exact location')).not.toBeInTheDocument();
  });
});
