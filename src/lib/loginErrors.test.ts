import { describe, expect, it } from 'vitest';
import { getLoginCredentialErrorMessage } from './loginErrors';

describe('login credential copy', () => {
  it('does not imply a migrated account for generic invalid credentials', () => {
    expect(getLoginCredentialErrorMessage()).toBe('Email or password is incorrect.');
  });

  it('uses migration guidance only with an explicit migration signal', () => {
    expect(getLoginCredentialErrorMessage(true)).toMatch(/Forgot password/);
    expect(getLoginCredentialErrorMessage(true)).not.toMatch(/upgraded/i);
  });
});
