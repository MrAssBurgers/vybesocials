import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ renders: 0 }));
vi.mock('@/hooks/useFriends', () => ({ useFriends: () => {
  if (++state.renders > 20) throw new Error('Unbounded share sheet render loop');
  return { data: [] };
} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: vi.fn(), bumpConversationUpdatedAt: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/lib/invalidateConversationCaches', () => ({ invalidateConversationCaches: vi.fn() }));
vi.mock('@/lib/premiumSounds', () => ({ premiumSounds: {} }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => null }));
vi.mock('@/lib/navVisibility', () => ({ navVisibility: { setInCommunityChat: vi.fn() } }));
import { ShareSheet } from './ShareSheet';
beforeEach(() => { state.renders = 0; });
afterEach(cleanup);
describe('share panel loading stability', () => {
  it.each([false, true])('settles with a fresh empty friends array while open=%s', isOpen => {
    render(<ShareSheet isOpen={isOpen} onClose={() => {}} postId="one" postType="short" />);
    expect(state.renders).toBeLessThan(5);
    if (!isOpen) expect(screen.queryByRole('button')).toBeNull();
  });
});
