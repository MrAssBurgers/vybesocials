import { describe, expect, it } from 'vitest';
import { inboxListIsLoading, inboxUnreadAnnouncement } from './inboxUnreadStatus';

describe('inbox unread announcement', () => {
  it('says the list is loading instead of claiming there are no unread messages', () => {
    expect(inboxListIsLoading({ showSkeleton: true, displayRows: [] })).toBe(true);
    expect(inboxListIsLoading({ isLoading: true, isFetched: false, displayRows: [] })).toBe(true);
    expect(inboxListIsLoading({ showSkeleton: true, displayRows: [{ id: 'c' }] })).toBe(false);
    expect(inboxListIsLoading({ isFetched: true, displayRows: [] })).toBe(false);
    expect(inboxUnreadAnnouncement(0, true)).toBe('Loading messages');
    expect(inboxUnreadAnnouncement(0, false)).toBe('No unread messages');
    expect(inboxUnreadAnnouncement(1, false)).toBe('1 unread message');
    expect(inboxUnreadAnnouncement(2, false)).toBe('2 unread messages');
  });
});
