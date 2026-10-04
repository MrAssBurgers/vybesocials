import { beforeEach, describe, expect, it } from 'vitest';
import { getPostLoginPath, resolvePostLoginDestination, stashAuthReturnPath } from './authReturnPath';

describe('post-login onboarding gate', () => {
  beforeEach(() => sessionStorage.clear());

  it('routes missing, incomplete, and generated profiles to onboarding', () => {
    expect(resolvePostLoginDestination(null)).toBe('/onboarding');
    expect(resolvePostLoginDestination({ onboarding_completed: false, username: 'realname' })).toBe('/onboarding');
    expect(resolvePostLoginDestination({ onboarding_completed: true, username: 'user_abcd1234' })).toBe('/onboarding');
  });

  it('uses the saved destination only for a completed profile', () => {
    stashAuthReturnPath('/messages');
    expect(resolvePostLoginDestination({ onboarding_completed: true, username: 'ready_user' })).toBe('/messages');
  });
});

it('retains consent details until onboarding is completed, then consumes them once', () => {
  sessionStorage.clear();
  stashAuthReturnPath('/connect/game?code=ABCD-2345#request');
  expect(resolvePostLoginDestination(null)).toBe('/onboarding');
  expect(resolvePostLoginDestination({ onboarding_completed: false })).toBe('/onboarding');
  expect(getPostLoginPath()).toBe('/connect/game?code=ABCD-2345#request');
  expect(getPostLoginPath()).toBe('/home');
});
