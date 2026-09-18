import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  beginLoginApprovalCheck,
  endLoginApprovalCheck,
  isLoginApprovalCheckInProgress,
} from './loginApprovalGate';

describe('loginApprovalGate checking TTL', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reports checking while flag is fresh', () => {
    beginLoginApprovalCheck();
    expect(isLoginApprovalCheckInProgress()).toBe(true);
    endLoginApprovalCheck();
    expect(isLoginApprovalCheckInProgress()).toBe(false);
  });

  it('expires a stuck checking flag after TTL', () => {
    beginLoginApprovalCheck();
    const stale = Date.now() - 61_000;
    sessionStorage.setItem('vybe-login-gate-checking-at', String(stale));
    expect(isLoginApprovalCheckInProgress()).toBe(false);
    expect(sessionStorage.getItem('vybe-login-gate-checking')).toBeNull();
  });
});
