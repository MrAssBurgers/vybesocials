import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: 'alice', epoch: 1 }) }));
import { profileSetupFailure } from './profileAccountGuard';

afterEach(() => vi.unstubAllGlobals());

describe('truthful profile loading failures', () => {
  it('classifies a readable HTML 404 through the installed Firebase SDK without a real request', async () => {
    const fetch = vi.fn(async () => new Response('<html>Not Found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    const app = initializeApp({ projectId: 'demo-profile-error-qa' }, 'profile-html-404');
    try {
      const error = await httpsCallable(getFunctions(app), 'ensureAccountProfile', { timeout: 500 })({}).catch(error => error);
      expect(fetch).toHaveBeenCalledOnce(); expect(error.code).toBe('functions/not-found');
      const failure = profileSetupFailure(error);
      expect(failure.title).toBe('Profile loading is unavailable');
      expect(failure.message).not.toMatch(/connection|password|saved|html/i);
      expect(failure.recoveryAvailable).toBe(false);
    } finally { await deleteApp(app); }
  });

  it('keeps a failed fetch ambiguous because the SDK cannot distinguish CORS and network failures', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }); vi.stubGlobal('fetch', fetch);
    const app = initializeApp({ projectId: 'demo-profile-error-qa' }, 'profile-fetch-failure');
    try {
      const error = await httpsCallable(getFunctions(app), 'ensureAccountProfile', { timeout: 500 })({}).catch(error => error);
      expect(fetch).toHaveBeenCalledOnce(); expect(error.code).toBe('functions/internal');
      expect(profileSetupFailure(error).title).toBe('Your profile couldn’t be loaded');
      expect(profileSetupFailure(error).message).not.toMatch(/connection|missing|saved/i);
    } finally { await deleteApp(app); }
  });

  it.each(['not-found', 'functions/not-found', 'unimplemented', 'not_yet_ported', 'profile-service-invalid-response'])('recognizes service failure %s without suggesting a fabricated profile', code => {
    const failure = profileSetupFailure({ name: code, message: 'Private server detail' });
    expect(failure.title).toBe('Profile loading is unavailable');
    expect(failure.message).toContain('still signed in'); expect(failure.message).not.toContain('Private');
    expect(failure.recoveryAvailable).toBe(false);
  });

  it.each([
    [{ code: 'deadline-exceeded' }, 'Profile loading timed out'],
    [{ name: 'auth/network-request-failed' }, 'Couldn’t connect to your profile'],
    [new TypeError('Failed to fetch'), 'Couldn’t connect to your profile'],
    [{ name: 'unauthenticated' }, 'Please check your sign-in'],
    [{ code: 'functions/permission-denied' }, 'Profile access needs attention'],
    [{ name: 'unavailable' }, 'Your profile couldn’t be loaded'],
  ])('keeps distinct failure guidance for %j', (error, title) => {
    expect(profileSetupFailure(error).title).toBe(title); expect(profileSetupFailure(error).recoveryAvailable).toBe(false);
  });

  it('only offers deliberate profile recovery when the server explicitly permits it', () => {
    const error = { name: 'failed-precondition', message: 'Foreign private details', details: { reason: 'profile-recovery-required', recoveryAvailable: true } };
    expect(profileSetupFailure(error)).toMatchObject({ title: 'Confirm your profile', recoveryAvailable: true, message: expect.stringContaining('Recover profile') });
    expect(profileSetupFailure({ ...error, details: { ...error.details, recoveryAvailable: false } })).toMatchObject({ recoveryAvailable: false, message: expect.stringContaining('ownership review') });
    expect(profileSetupFailure(error).message).not.toContain('Foreign');
  });
});
