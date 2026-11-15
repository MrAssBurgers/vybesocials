import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Community } from '@/hooks/useCommunities';
import { CommunityCard, PublicCommunityCard } from './CommunityCard';

vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => null }));
afterEach(cleanup);
const community: Community = { id: 'alpha', name: 'Alpha club', description: 'A test community', icon_url: null, banner_url: null, cover_url: null, owner_id: 'alice', invite_code: '', is_public: true, member_count: 3, active_now_count: 1, created_at: '2026-11-14T00:00:00Z' };

describe('community entry controls', () => {
  it.each(['{Enter}', ' '])('opens a community from its named keyboard control with %s', async key => {
    const user = userEvent.setup(), open = vi.fn();
    render(<CommunityCard community={community} onClick={open} unreadCount={2} />);
    const entry = screen.getByRole('button', { name: 'Open Alpha club' });
    entry.focus(); await user.keyboard(key);
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Alpha club' })).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
  });

  it('identifies the community being joined and blocks another join while it is pending', async () => {
    const user = userEvent.setup(), join = vi.fn();
    const view = render(<PublicCommunityCard community={community} onJoin={join} isJoining={false} />);
    await user.click(screen.getByRole('button', { name: 'Join Alpha club' }));
    expect(join).toHaveBeenCalledOnce();
    view.rerender(<PublicCommunityCard community={community} onJoin={join} isJoining />);
    const pending = screen.getByRole('button', { name: 'Joining Alpha club' });
    expect(pending).toBeDisabled(); expect(pending).toHaveAttribute('aria-busy', 'true');
    await user.click(pending); expect(join).toHaveBeenCalledOnce();
  });
});
