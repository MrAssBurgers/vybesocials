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
});
