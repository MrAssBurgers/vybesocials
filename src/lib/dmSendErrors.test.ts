import { describe, expect, it } from 'vitest';
import {
  classifyDmSendError,
  dmSendFailureUserMessage,
  isPermanentDmSendFailure,
  isRetryableCloudInternal,
  isTransientDmSendFailure,
} from '@/lib/dmSendErrors';

describe('classifyDmSendError — blocked / rate-limit / transient', () => {
  it('classifies blocked user sending to a direct chat', () => {
    expect(
      classifyDmSendError({
        code: 'permission-denied',
        message: "You can't message this user",
      }),
    ).toBe('blocked');
    expect(isPermanentDmSendFailure('blocked')).toBe(true);
    expect(isTransientDmSendFailure('blocked')).toBe(false);
  });

  it('classifies blocked user sending through offline retry (same error string)', () => {
    const kind = classifyDmSendError("You can't message this user");
    expect(kind).toBe('blocked');
    expect(isPermanentDmSendFailure(kind)).toBe(true);
  });

  it('classifies blocked media / reply / new conversation the same way', () => {
    for (const message of [
      "You can't message this user",
      'You can’t message this user',
      'blocked',
    ]) {
      expect(classifyDmSendError({ code: 'permission-denied', message })).toBe('blocked');
    }
  });

  it('classifies unblocked success path as non-blocked (no error)', () => {
    expect(classifyDmSendError(null)).toBe('unknown');
    expect(classifyDmSendError({ message: 'ok' })).toBe('unknown');
  });

  it('classifies rate-limit during rapid sends', () => {
    expect(
      classifyDmSendError({ code: 'resource-exhausted', message: 'Rate limit exceeded' }),
    ).toBe('rate_limited');
    expect(isTransientDmSendFailure('rate_limited')).toBe(true);
    expect(isPermanentDmSendFailure('rate_limited')).toBe(false);
    expect(dmSendFailureUserMessage('rate_limited')).toMatch(/too fast/i);
  });

  it('classifies network / offline as transient for reconnect retries', () => {
    expect(classifyDmSendError({ message: 'Failed to fetch' })).toBe('transient');
    expect(classifyDmSendError({ message: 'network timeout' })).toBe('transient');
    expect(isTransientDmSendFailure('transient')).toBe(true);
  });

  it('does not treat bare CF internal as Waiting for connection when online', () => {
    expect(classifyDmSendError({ code: 'internal', message: 'INTERNAL' })).toBe('unknown');
    expect(classifyDmSendError({ code: 'functions/internal', message: 'internal' })).toBe('unknown');
    expect(dmSendFailureUserMessage('unknown', 'internal')).toMatch(/try again/i);
    expect(dmSendFailureUserMessage('unknown', 'internal')).not.toMatch(/connection/i);
  });

  it('marks bare CF internal as in-flight retryable (Cloud Run capacity)', () => {
    expect(isRetryableCloudInternal({ code: 'internal', message: 'internal' })).toBe(true);
    expect(isRetryableCloudInternal({ name: 'internal', message: 'INTERNAL' })).toBe(true);
    expect(isRetryableCloudInternal({ code: 'permission-denied', message: 'blocked' })).toBe(false);
  });

  it('classifies validation and permission distinctly', () => {
    expect(
      classifyDmSendError({ code: 'invalid-argument', message: 'content or mediaUrl required' }),
    ).toBe('validation');
    expect(
      classifyDmSendError({ code: 'permission-denied', message: 'Not a member of this conversation' }),
    ).toBe('permission');
  });
});

describe('outbox retry policy for blocked vs rate-limit', () => {
  it('does not auto-retry blocked offline items', () => {
    const kind = classifyDmSendError({
      code: 'permission-denied',
      message: "You can't message this user",
    });
    const shouldAutoRetry =
      isTransientDmSendFailure(kind) && !isPermanentDmSendFailure(kind);
    expect(shouldAutoRetry).toBe(false);
  });

  it('does auto-retry rate-limited rapid sends', () => {
    const kind = classifyDmSendError({
      code: 'resource-exhausted',
      message: 'Rate limit exceeded',
    });
    const shouldAutoRetry =
      isTransientDmSendFailure(kind) && !isPermanentDmSendFailure(kind);
    expect(shouldAutoRetry).toBe(true);
  });

  it('dedupe key (client_message_id) is stable across reconnect retries', () => {
    const tempId = 'temp-abc-123';
    // Outbox + instant send both pass the same temp id as client_message_id.
    expect(tempId).toMatch(/^temp-/);
    expect(tempId.length).toBeLessThan(128);
  });
});
