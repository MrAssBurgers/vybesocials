import { describe, expect, it } from 'vitest';
import { shouldIgnoreSwipeBackTarget, SWIPE_BACK_EDGE_PX } from './useSwipeBack';

describe('shouldIgnoreSwipeBackTarget', () => {
  it('ignores targets inside the chat header', () => {
    const header = document.createElement('header');
    header.className = 'dm-chat-header';
    const btn = document.createElement('button');
    btn.className = 'dm-chat-header-back';
    header.appendChild(btn);
    document.body.appendChild(header);
    expect(shouldIgnoreSwipeBackTarget(btn)).toBe(true);
    expect(shouldIgnoreSwipeBackTarget(header)).toBe(true);
    header.remove();
  });

  it('allows targets outside the chat header', () => {
    const main = document.createElement('div');
    main.className = 'messages-scroll';
    document.body.appendChild(main);
    expect(shouldIgnoreSwipeBackTarget(main)).toBe(false);
    expect(shouldIgnoreSwipeBackTarget(null)).toBe(false);
    main.remove();
  });
});

describe('SWIPE_BACK_EDGE_PX', () => {
  it('stays narrower than the back control', () => {
    expect(SWIPE_BACK_EDGE_PX).toBeLessThanOrEqual(16);
  });
});
