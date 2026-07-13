import { describe, expect, it } from 'vitest';
import {
  globalSendConfirmationText,
  isEphemeralViewMode,
  shouldAnimateSnapSend,
  shouldShowOfflineWaitingLabel,
  shouldShowRetryFailedOnly,
  shouldStayOnCameraAfterSend,
} from './snapFlowBehavior';

describe('shouldStayOnCameraAfterSend', () => {
  it('keeps the overlay open only for global launches', () => {
    expect(shouldStayOnCameraAfterSend('global')).toBe(true);
    expect(shouldStayOnCameraAfterSend('conversation')).toBe(false);
    expect(shouldStayOnCameraAfterSend('profile')).toBe(false);
  });
});

describe('globalSendConfirmationText', () => {
  it('formats destination counts', () => {
    expect(globalSendConfirmationText(0)).toBe('Sent');
    expect(globalSendConfirmationText(1)).toBe('Sent to 1');
    expect(globalSendConfirmationText(3)).toBe('Sent to 3');
  });
});

describe('shouldAnimateSnapSend', () => {
  it('skips animation when reduced motion is preferred', () => {
    expect(shouldAnimateSnapSend(true, true)).toBe(false);
    expect(shouldAnimateSnapSend(true, false)).toBe(true);
    expect(shouldAnimateSnapSend(false, false)).toBe(false);
  });
});

describe('ephemeral offline pending', () => {
  it('flags view-once and replay-once modes', () => {
    expect(isEphemeralViewMode('view_once')).toBe(true);
    expect(isEphemeralViewMode('replay_once')).toBe(true);
    expect(isEphemeralViewMode('24h')).toBe(false);
    expect(isEphemeralViewMode('permanent')).toBe(false);
  });

  it('shows waiting label only for ephemeral offline jobs', () => {
    expect(shouldShowOfflineWaitingLabel('view_once', 'waiting_for_connection')).toBe(true);
    expect(shouldShowOfflineWaitingLabel('permanent', 'waiting_for_connection')).toBe(false);
    expect(shouldShowOfflineWaitingLabel('view_once', 'uploading')).toBe(false);
  });
});

describe('shouldShowRetryFailedOnly', () => {
  it('shows retry for partial and full failures', () => {
    expect(
      shouldShowRetryFailedOnly('partially_sent', [
        { kind: 'conversation', id: 'c1', state: 'sent', key: 'conversation:c1' },
        { kind: 'conversation', id: 'c2', state: 'failed', key: 'conversation:c2' },
      ]),
    ).toBe(true);
    expect(shouldShowRetryFailedOnly('sent', [])).toBe(false);
  });
});
