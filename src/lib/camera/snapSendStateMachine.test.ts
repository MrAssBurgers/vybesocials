import { describe, expect, it } from 'vitest';
import {
  applyDestinationState,
  createDestinationStatuses,
  deriveJobPhase,
  destinationKey,
  failedDestinations,
  isTerminalPhase,
  phaseLabel,
  resetFailedForRetry,
} from './snapSendStateMachine';

function statuses() {
  return createDestinationStatuses({
    conversationIds: ['c1', 'c2'],
    storyDestinationIds: ['my_story'],
  });
}

describe('createDestinationStatuses', () => {
  it('creates one pending status per destination', () => {
    const d = statuses();
    expect(d).toHaveLength(3);
    expect(d.every((x) => x.state === 'pending')).toBe(true);
    expect(d.map((x) => x.key)).toEqual(['conversation:c1', 'conversation:c2', 'story:my_story']);
  });
});

describe('deriveJobPhase', () => {
  it('reports transport phases first', () => {
    const d = statuses();
    expect(deriveJobPhase(d, { offline: true })).toBe('waiting_for_connection');
    expect(deriveJobPhase(d, { uploadFailed: true })).toBe('failed');
    expect(deriveJobPhase(d, { uploading: true })).toBe('uploading');
    expect(deriveJobPhase(d, { processing: true })).toBe('processing');
  });

  it('is preparing before destinations exist', () => {
    expect(deriveJobPhase([])).toBe('preparing');
  });

  it('is sending while any destination is pending or in flight', () => {
    let d = statuses();
    expect(deriveJobPhase(d)).toBe('sending');
    d = applyDestinationState(d, 'conversation:c1', 'sent');
    expect(deriveJobPhase(d)).toBe('sending');
    expect(deriveJobPhase(d, { retrying: true })).toBe('retrying');
  });

  it('is sent when every destination succeeded', () => {
    let d = statuses();
    for (const x of d) d = applyDestinationState(d, x.key, 'sent');
    expect(deriveJobPhase(d)).toBe('sent');
  });

  it('is partially_sent on mixed results and failed when all fail', () => {
    let d = statuses();
    d = applyDestinationState(d, 'conversation:c1', 'sent');
    d = applyDestinationState(d, 'conversation:c2', 'failed', 'blocked');
    d = applyDestinationState(d, 'story:my_story', 'failed', 'boom');
    expect(deriveJobPhase(d)).toBe('partially_sent');

    let all = statuses();
    for (const x of all) all = applyDestinationState(all, x.key, 'failed', 'x');
    expect(deriveJobPhase(all)).toBe('failed');
  });
});

describe('retry failed only', () => {
  it('resets only failed destinations to pending', () => {
    let d = statuses();
    d = applyDestinationState(d, 'conversation:c1', 'sent');
    d = applyDestinationState(d, 'conversation:c2', 'failed', 'err');
    d = applyDestinationState(d, 'story:my_story', 'failed', 'err2');

    expect(failedDestinations(d).map((x) => x.id)).toEqual(['c2', 'my_story']);

    const retried = resetFailedForRetry(d);
    expect(retried.find((x) => x.id === 'c1')?.state).toBe('sent');
    expect(retried.find((x) => x.id === 'c2')?.state).toBe('pending');
    expect(retried.find((x) => x.id === 'c2')?.error).toBeUndefined();
    expect(retried.find((x) => x.id === 'my_story')?.state).toBe('pending');
  });
});

describe('helpers', () => {
  it('builds stable keys and terminal checks', () => {
    expect(destinationKey('conversation', 'c1')).toBe('conversation:c1');
    expect(isTerminalPhase('sent')).toBe(true);
    expect(isTerminalPhase('partially_sent')).toBe(true);
    expect(isTerminalPhase('failed')).toBe(true);
    expect(isTerminalPhase('sending')).toBe(false);
    expect(isTerminalPhase('waiting_for_connection')).toBe(false);
  });

  it('labels every phase', () => {
    const phases = [
      'preparing',
      'waiting_for_connection',
      'uploading',
      'processing',
      'sending',
      'retrying',
      'sent',
      'partially_sent',
      'failed',
    ] as const;
    for (const p of phases) expect(phaseLabel(p)).toBeTruthy();
  });
});
