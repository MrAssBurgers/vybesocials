import { describe, expect, it } from 'vitest';
import {
  friendshipUiStatus,
  normalizeFriendshipState,
} from './useFriends';

describe('friendship state normalization', () => {
  it('keeps pending direction explicit while preserving UI aliases', () => {
    expect(normalizeFriendshipState('pending', 'outgoing')).toBe('pending_outgoing');
    expect(normalizeFriendshipState('pending', 'incoming')).toBe('pending_incoming');
    expect(friendshipUiStatus('pending_outgoing')).toBe('pending_sent');
    expect(friendshipUiStatus('pending_incoming')).toBe('pending_received');
  });

  it('does not treat terminal request states as pending', () => {
    expect(normalizeFriendshipState('declined', 'outgoing')).toBe('declined');
    expect(normalizeFriendshipState('cancelled', 'incoming')).toBe('cancelled');
    expect(friendshipUiStatus('declined')).toBe('none');
    expect(friendshipUiStatus('cancelled')).toBe('none');
  });

  it('maps accepted and blocked states without ambiguity', () => {
    expect(normalizeFriendshipState('accepted', 'outgoing')).toBe('accepted');
    expect(friendshipUiStatus('accepted')).toBe('friends');
    expect(friendshipUiStatus('blocked')).toBe('blocked');
    expect(normalizeFriendshipState('unexpected', 'incoming')).toBe('none');
  });
});
