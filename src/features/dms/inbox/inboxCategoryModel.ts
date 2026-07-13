import type { InboxCategory } from '@/features/dms/dm.types';

/** Primary Snapchat-style filter row (Chat = all via null). */
export const INBOX_CATEGORIES: InboxCategory[] = [
  'best-friends',
  'groups',
  'unread',
  'active',
];

/** Extra filters kept for persistence/normalize — opened from More later. */
export const INBOX_MORE_CATEGORIES: InboxCategory[] = [
  'needs-reply',
  'nearby',
  'stories',
  'calls',
  'streaks',
  'new',
];

export const INBOX_CATEGORY_LABELS: Record<InboxCategory, string> = {
  all: 'Chat',
  unread: 'Unread',
  'needs-reply': 'Needs Reply',
  nearby: 'Near Me',
  groups: 'Groups',
  stories: 'Stories',
  calls: 'Calls',
  'best-friends': 'Best Friends',
  streaks: 'Streaks',
  active: 'Active',
  new: 'New',
};

export const INBOX_CATEGORY_EMPTY: Record<InboxCategory, { title: string; body: string }> = {
  all: { title: 'No chats yet', body: 'Start a conversation to see it here.' },
  unread: { title: "You're all caught up.", body: 'No unread messages right now.' },
  'needs-reply': {
    title: 'No conversations are waiting on you.',
    body: 'When someone messages you, unanswered chats land here.',
  },
  nearby: {
    title: 'No friends are sharing their location nearby.',
    body: 'Friends who share location in your area will appear here.',
  },
  groups: { title: 'No group conversations yet.', body: 'Start a group chat to hang with everyone at once.' },
  stories: { title: 'No active friend stories.', body: 'When friends post stories, they show up here.' },
  calls: { title: 'No recent calls.', body: 'Missed and recent calls appear in this filter.' },
  'best-friends': {
    title: 'Keep chatting to build your closest connections.',
    body: 'Your best friends and top-ranked chats show here.',
  },
  streaks: { title: 'No active streaks.', body: 'Snap back daily to build streaks with friends.' },
  active: { title: 'No friends are online right now.', body: 'When friends come online, they show up here.' },
  new: { title: 'No new people to add right now.', body: 'Friend requests and suggestions appear here.' },
};

export const INBOX_CATEGORY_SESSION_KEY = 'vybe-dm-inbox-category';

const ALL_KNOWN: InboxCategory[] = [
  ...INBOX_CATEGORIES,
  ...INBOX_MORE_CATEGORIES,
];

export function normalizeInboxCategory(value: string | null | undefined): InboxCategory | null {
  if (!value || value === 'all') return null;
  if (value === 'needs_reply') return 'needs-reply';
  if (value === 'best_friends') return 'best-friends';
  if (ALL_KNOWN.includes(value as InboxCategory)) {
    return value as InboxCategory;
  }
  return null;
}
