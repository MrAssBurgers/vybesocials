import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RootBottomNavMount } from './RootBottomNavMount';
const state = vi.hoisted(() => ({ user: null as null | { id: string }, show: true }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: null }) }));
vi.mock('@/hooks/useBottomNavMount', () => ({ useBottomNavMount: () => state.show }));
vi.mock('@/hooks/useRecoverBottomNavOnTabEnter', () => ({ useRecoverBottomNavOnTabEnter: () => {} }));
vi.mock('./BottomNav', () => ({ BottomNav: () => <nav aria-label="Bottom navigation" /> }));
afterEach(cleanup);
beforeEach(() => { state.user = null; state.show = true; });
describe('root bottom navigation', () => {
  it('does not cover guest sign-in actions', () => {
    render(<RootBottomNavMount />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('retains navigation for an authenticated tab', () => {
    state.user = { id: 'test-user' }; render(<RootBottomNavMount />);
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument();
  });
  it('respects immersive and non-tab route hiding for authenticated users', () => {
    state.user = { id: 'test-user' }; state.show = false; render(<RootBottomNavMount />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
