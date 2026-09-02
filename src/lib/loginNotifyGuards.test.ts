import { describe, expect, it } from 'vitest';
import {
  gateKnownSession,
  shouldExpireStaleLoginChallenge,
} from '../../functions/src/_shared/loginNotifyGuards';

describe('auth-login-notify known session guards', () => {
  it('requires approval when an untrusted install retries password sign-in', () => {
    expect(
      gateKnownSession({ pendingApproval: true, trusted: false, isResume: false }),
    ).toEqual({ action: 'require_approval' });
  });

  it('allows trusted same-device heartbeats without re-approval', () => {
    expect(
      gateKnownSession({ pendingApproval: false, trusted: true, isResume: false }),
    ).toEqual({ action: 'trusted_heartbeat' });
  });

  it('does not expire same-device challenges while the session is still untrusted', () => {
    expect(
      shouldExpireStaleLoginChallenge({ trusted: false, sameDevice: true, resumeNoise: false }),
    ).toBe(false);
  });

  it('expires same-device challenges once the install is trusted', () => {
    expect(
      shouldExpireStaleLoginChallenge({ trusted: true, sameDevice: true, resumeNoise: false }),
    ).toBe(true);
  });
});
