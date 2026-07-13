import { describe, expect, it } from 'vitest';
import {
  classifyConversationGestureMove,
  HOLD_CANCEL_PX,
  HOLD_MS,
  shouldOpenConversationHold,
} from './dmLongPressGesture';

describe('conversation long-press gesture', () => {
  it('opens after the hold threshold without movement', () => {
    expect(shouldOpenConversationHold(HOLD_MS, 0, 0)).toBe(true);
    expect(shouldOpenConversationHold(HOLD_MS - 1, 0, 0)).toBe(false);
  });

  it('does not open after the finger moves beyond slop', () => {
    expect(shouldOpenConversationHold(600, HOLD_CANCEL_PX + 1, 0)).toBe(false);
    expect(shouldOpenConversationHold(600, 0, HOLD_CANCEL_PX + 1)).toBe(false);
  });

  it('still opens within 10px slop', () => {
    expect(shouldOpenConversationHold(HOLD_MS, 9, 9)).toBe(true);
    expect(shouldOpenConversationHold(HOLD_MS, 11, 0)).toBe(false);
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
