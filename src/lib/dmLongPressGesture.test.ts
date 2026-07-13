import { describe, expect, it } from 'vitest';
import {
  classifyConversationGestureMove,
  shouldOpenConversationHold,
} from './dmLongPressGesture';

describe('conversation long-press gesture', () => {
  it('opens after the hold threshold without movement', () => {
    expect(shouldOpenConversationHold(480, 0, 0)).toBe(true);
    expect(shouldOpenConversationHold(479, 0, 0)).toBe(false);
  });

  it('does not open after the finger moves beyond slop', () => {
    expect(shouldOpenConversationHold(600, 9, 0)).toBe(false);
    expect(shouldOpenConversationHold(600, 0, 9)).toBe(false);
  });

  it('classifies vertical movement as scrolling', () => {
    expect(classifyConversationGestureMove(2, 11)).toBe('scrolling');
  });

  it('classifies horizontal movement as swiping', () => {
    expect(classifyConversationGestureMove(14, 3)).toBe('swiping');
  });

  it('keeps small movement pending', () => {
    expect(classifyConversationGestureMove(5, 6)).toBe('pending');
  });
});
