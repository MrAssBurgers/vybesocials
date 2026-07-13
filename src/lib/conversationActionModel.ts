export interface ConversationActionState {
  pinLabel: 'Pin Conversation' | 'Unpin Conversation';
  muteLabel: 'Mute Notifications' | 'Unmute Notifications';
  readLabel: 'Mark Read' | 'Mark Unread';
  showFriendActions: boolean;
  showCreateGroup: boolean;
  showLocation: boolean;
}

export function conversationActionState(input: {
  isPinned: boolean;
  isMuted: boolean;
  isUnread: boolean;
  isGroup: boolean;
  hasFriend: boolean;
}): ConversationActionState {
  const showFriendActions = !input.isGroup && input.hasFriend;
  return {
    pinLabel: input.isPinned ? 'Unpin Conversation' : 'Pin Conversation',
    muteLabel: input.isMuted ? 'Unmute Notifications' : 'Mute Notifications',
    readLabel: input.isUnread ? 'Mark Read' : 'Mark Unread',
    showFriendActions,
    showCreateGroup: showFriendActions,
    showLocation: showFriendActions,
  };
}
