import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendCardSheet } from './FriendCardSheet';
import type { LiveFriend } from '@/lib/vybemap/types';
afterEach(cleanup);
const friend: LiveFriend = { id: 'sample', user_id: 'bob', latitude: 0, longitude: 0, label: null, updated_at: new Date().toISOString(), expires_at: null, sharing_enabled: true, profile: { username: 'bob', display_name: 'Bob', avatar_url: null } };
const props = () => ({ friend, myCoords: null, onClose: vi.fn(), onMessage: vi.fn(), onNavigate: vi.fn(), onFind: vi.fn(), onProfile: vi.fn() });
describe('map friend card controls', () => {
  it('keeps chat, profile and close usable without the viewer location', () => {
    const p = props(); render(<FriendCardSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' })); expect(p.onMessage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Profile' })); expect(p.onProfile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close friend card' })); expect(p.onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Enable your location to use the finder' })).toBeDisabled(); expect(p.onFind).not.toHaveBeenCalled();
  });
  it('prevents repeated chat requests and displays failure for retry', () => {
    const p = props(); const view = render(<FriendCardSheet {...p} messagePending />);
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();
    view.rerender(<FriendCardSheet {...p} messageError="Opening the chat took too long. Please retry." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Please retry'); expect(screen.getByRole('button', { name: 'Chat' })).toBeEnabled();
  });
  it('never substitutes Chat when Wave is unavailable', () => {
    const p = props(); render(<FriendCardSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wave' })); expect(p.onMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Wave' })).toBeDisabled();
  });
  it('keeps a real wave usable with own GPS off and exposes pending/error/cooldown feedback', () => {
    const p = props(), wave = vi.fn(); const view = render(<FriendCardSheet {...p} onWave={wave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wave' })); expect(wave).toHaveBeenCalledOnce();
    view.rerender(<FriendCardSheet {...p} onWave={wave} wavePending />); expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled(); expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<FriendCardSheet {...p} onWave={wave} waveError="Offline. Please retry." />); expect(screen.getByRole('alert')).toHaveTextContent('Offline'); fireEvent.click(screen.getByRole('button', { name: 'Retry wave' })); expect(wave).toHaveBeenCalledTimes(2);
    view.rerender(<FriendCardSheet {...p} onWave={wave} waveMessage="Wave sent." waveCooldownSeconds={42} />); expect(screen.getByRole('status')).toHaveTextContent('in-app notification'); expect(screen.getByRole('button', { name: 'Wave in 42s' })).toBeDisabled();
    view.rerender(<FriendCardSheet {...p} onWave={wave} waveAvailable={false} />); expect(screen.getByRole('button', { name: 'Wave' })).toBeDisabled(); expect(screen.getByText(/map access is refreshed/)).toBeInTheDocument();
  });
});
