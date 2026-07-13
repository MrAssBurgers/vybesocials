import { beforeEach, describe, expect, it } from 'vitest';
import { readFilterScroll, writeFilterScroll } from '@/lib/dmInboxFilterPersistence';

beforeEach(() => {
  sessionStorage.clear();
});

describe('dm inbox scroll persistence', () => {
  it('stores scroll per category key independently', () => {
    writeFilterScroll('all', 120);
    writeFilterScroll('unread', 48);
    expect(readFilterScroll('all')).toBe(120);
    expect(readFilterScroll('unread')).toBe(48);
  });

  it('restores chat-return scroll from the active filter key', () => {
    writeFilterScroll('best-friends', 256);
    expect(readFilterScroll('best-friends')).toBe(256);
  });
});
