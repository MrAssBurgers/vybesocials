import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  beginLoginApprovalCheck,
  endLoginApprovalCheck,
  isLoginApprovalCheckInProgress,
  clearPendingLoginApproval, setPendingLoginApproval, getPendingLoginApproval, shouldBlockPostLoginNavigation,
} from './loginApprovalGate';

describe('loginApprovalGate checking TTL', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPendingLoginApproval();
  });

  afterEach(() => {
    vi.restoreAllMocks(); vi.useRealTimers(); clearPendingLoginApproval(); sessionStorage.clear();
  });

  it('reports checking while flag is fresh', () => {
    beginLoginApprovalCheck();
    expect(isLoginApprovalCheckInProgress()).toBe(true);
    endLoginApprovalCheck();
    expect(isLoginApprovalCheckInProgress()).toBe(false);
  });

  it('expires a stuck checking flag after TTL', () => {
    vi.useFakeTimers();
    beginLoginApprovalCheck();
    vi.advanceTimersByTime(61_000);
    expect(isLoginApprovalCheckInProgress()).toBe(false);
    expect(sessionStorage.getItem('vybe-login-gate-checking')).toBeNull();
  });
  it('keeps both active checking and the pending confirmation closed when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('Storage blocked'); });
    beginLoginApprovalCheck(); expect(isLoginApprovalCheckInProgress()).toBe(true);
    setPendingLoginApproval({ challengeId: 'email-one', expiresAt: new Date(Date.now() + 600_000).toISOString(), method: 'email_2fa' });
    endLoginApprovalCheck(); expect(getPendingLoginApproval()?.challengeId).toBe('email-one'); expect(shouldBlockPostLoginNavigation()).toBe(true);
    clearPendingLoginApproval(); expect(getPendingLoginApproval()).toBeNull(); expect(isLoginApprovalCheckInProgress()).toBe(false);
  });
});
