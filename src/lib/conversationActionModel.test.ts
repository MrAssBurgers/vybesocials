import { describe, expect, it } from 'vitest';
import { conversationActionState } from './conversationActionModel';

describe('conversation action state', () => {
  it('uses inverse labels for active state', () => {
    const state = conversationActionState({
      isPinned: true,
      isMuted: true,
      isUnread: true,
      isGroup: false,
      hasFriend: true,
    });
    expect(state.pinLabel).toBe('Unpin Conversation');
    expect(state.muteLabel).toBe('Unmute Notifications');
    expect(state.readLabel).toBe('Mark Read');
  });

  it('uses activation labels for inactive state', () => {
    const state = conversationActionState({
      isPinned: false,
      isMuted: false,
      isUnread: false,
      isGroup: false,
      hasFriend: true,
    });
    expect(state.pinLabel).toBe('Pin Conversation');
    expect(state.muteLabel).toBe('Mute Notifications');
    expect(state.readLabel).toBe('Mark Unread');
  });

  it('hides friend-only actions for groups', () => {
    const state = conversationActionState({
      isPinned: false,
      isMuted: false,
      isUnread: false,
      isGroup: true,
      hasFriend: false,
    });
    expect(state.showFriendActions).toBe(false);
    expect(state.showCreateGroup).toBe(false);
    expect(state.showLocation).toBe(false);
  });
});
