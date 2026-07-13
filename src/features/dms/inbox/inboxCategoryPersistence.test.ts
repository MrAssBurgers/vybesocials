import { describe, expect, it } from 'vitest';
import {
  INBOX_CATEGORY_SESSION_KEY,
  normalizeInboxCategory,
} from './inboxCategoryModel';
import {
  readFilterScroll,
  writeFilterScroll,
} from '@/lib/dmInboxFilterPersistence';

describe('inboxCategoryPersistence', () => {
  it('normalizes legacy snake_case ids', () => {
    expect(normalizeInboxCategory('needs_reply')).toBe('needs-reply');
    expect(normalizeInboxCategory('best_friends')).toBe('best-friends');
    expect(normalizeInboxCategory('all')).toBeNull();
  });

  it('stores per-category scroll positions', () => {
    writeFilterScroll('needs-reply', 120);
    writeFilterScroll('unread', 48);
    expect(readFilterScroll('needs-reply')).toBe(120);
    expect(readFilterScroll('unread')).toBe(48);
  });

  it('uses dedicated session key constant', () => {
    expect(INBOX_CATEGORY_SESSION_KEY).toBe('vybe-dm-inbox-category');
  });
});
