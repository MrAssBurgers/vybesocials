import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/useVybeDNA', () => ({ useVybeDNA: () => ({ data: null }) }));
vi.mock('@/hooks/useBadges', () => ({ useUserBadges: () => ({ data: [] }) }));
vi.mock('@/components/badges', () => ({ BadgeRow: () => null }));
import { ProfileVibeBoard } from './ProfileVibeBoard';
afterEach(cleanup);
describe('profile engagement requires confirmed statistics', () => {
  it('withholds a score until both post and follow counts are confirmed', () => {
    const props = { userId: 'alice-profile', isOwnProfile: true, postCount: 7, postCountExact: true, followerCount: 0, followingCount: 0 };
    const view = render(<ProfileVibeBoard {...props} followCountsExact={false} />);
    expect(screen.getByText('Engagement score unavailable')).toBeInTheDocument();
    view.rerender(<ProfileVibeBoard {...props} followCountsExact={true} followerCount={3} followingCount={2} />);
    expect(screen.queryByText('Engagement score unavailable')).not.toBeInTheDocument();
    view.rerender(<ProfileVibeBoard {...props} followCountsExact={true} postCountExact={false} />);
    expect(screen.getByText('Engagement score unavailable')).toBeInTheDocument();
  });
});
