import { describe, expect, it } from 'vitest';
import { deriveProfileActions, deriveProfileMenuActions, deriveProfileViewMode } from './profileMode';

describe('deriveProfileViewMode', () => {
  it('maps relationship states to modes', () => {
    expect(deriveProfileViewMode({ isSelf: true, isBlocked: false, friendshipStatus: 'none' })).toBe('self');
    expect(deriveProfileViewMode({ isSelf: false, isBlocked: true, friendshipStatus: 'none' })).toBe('blocked');
    expect(deriveProfileViewMode({ isSelf: false, isBlocked: false, friendshipStatus: 'friends' })).toBe('friend');
    expect(deriveProfileViewMode({ isSelf: false, isBlocked: false, friendshipStatus: 'pending_received' })).toBe('incoming');
    expect(deriveProfileViewMode({ isSelf: false, isBlocked: false, friendshipStatus: 'pending_sent' })).toBe('outgoing');
    expect(deriveProfileViewMode({ isSelf: false, isBlocked: false, friendshipStatus: 'none' })).toBe('not_friends');
  });
});

describe('deriveProfileActions', () => {
  it('keeps one primary and at most three secondary actions', () => {
    const friend = deriveProfileActions('friend');
    expect(friend.primary).toBe('message');
    expect(friend.secondary.length).toBeLessThanOrEqual(3);

    const self = deriveProfileActions('self');
    expect(self.primary).toBe('edit_profile');
    expect(self.secondary).toEqual(['share_profile', 'profile_settings']);

    expect(deriveProfileActions('blocked').primary).toBeNull();
    expect(deriveProfileActions('not_friends').primary).toBe('add_friend');
  });
});

describe('deriveProfileMenuActions', () => {
  it('does not expose friendship tools to strangers', () => {
    expect(deriveProfileMenuActions('not_friends')).not.toContain('view_friendship');
    expect(deriveProfileMenuActions('friend')).toContain('view_friendship');
    expect(deriveProfileMenuActions('self')).toContain('account_settings');
  });
});
