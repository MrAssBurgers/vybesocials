import { describe, expect, it } from 'vitest';
import {
  isBottomNavTabRoute,
  isMessagesNavActive,
  isMessagesThreadPath,
} from './bottomNavRoutes';

describe('isMessagesThreadPath', () => {
  it('detects conversation threads', () => {
    expect(isMessagesThreadPath('/messages/abc123')).toBe(true);
  });

  it('ignores inbox and immersive siblings', () => {
    expect(isMessagesThreadPath('/messages')).toBe(false);
    expect(isMessagesThreadPath('/messages/search')).toBe(false);
    expect(isMessagesThreadPath('/messages/new')).toBe(false);
  });
});

describe('isBottomNavTabRoute', () => {
  it('mounts nav on inbox and primary tabs, not open DM threads', () => {
    expect(isBottomNavTabRoute('/messages/abc123')).toBe(false);
    expect(isBottomNavTabRoute('/messages')).toBe(true);
    expect(isBottomNavTabRoute('/home')).toBe(true);
  });

  it('hides nav on immersive messages siblings', () => {
    expect(isBottomNavTabRoute('/messages/search')).toBe(false);
    expect(isBottomNavTabRoute('/messages/new')).toBe(false);
  });
});

describe('isMessagesNavActive', () => {
  it('highlights Messages for inbox and threads', () => {
    expect(isMessagesNavActive('/messages')).toBe(true);
    expect(isMessagesNavActive('/messages/xyz')).toBe(true);
    expect(isMessagesNavActive('/home')).toBe(false);
  });
});
