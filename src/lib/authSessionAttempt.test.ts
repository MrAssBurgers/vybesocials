import { expect, it, vi } from 'vitest';
import { captureAuthSnapshotGuard, completeAuthConfirmation, createAuthAttemptController, type AuthAttemptSnapshot, type AuthSessionAttempt } from './authSessionAttempt';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let account: AuthAttemptSnapshot = { uid: 'alice', epoch: 1 };
  const gate = { begin: vi.fn(), end: vi.fn() };
  const controller = createAuthAttemptController(() => account, gate);
  const switchTo = (uid: string | undefined) => { account = { uid, epoch: account.epoch + 1 }; };
  const run = (attempt: AuthSessionAttempt, check: () => Promise<string | null>) => {
    const effects = { hydrate: vi.fn(), signOut: vi.fn(async () => { attempt.guard(); switchTo(undefined); attempt.signedOut(); }) };
    return { effects, result: completeAuthConfirmation(attempt, { ...effects, check }) };
  };
  return { controller, gate, switchTo, run };
}

it('hydrates only after a checked current confirmation and then releases its own gate', async () => {
  const f = fixture(), attempt = f.controller.start('alice'), response = deferred<string | null>();
  const { result, effects } = f.run(attempt, () => response.promise);
  expect(effects.hydrate).not.toHaveBeenCalled(); expect(f.gate.end).not.toHaveBeenCalled();
  response.resolve(null); expect(await result).toBeNull();
  expect(effects.hydrate).toHaveBeenCalledOnce(); expect(effects.signOut).not.toHaveBeenCalled(); expect(f.gate.end).toHaveBeenCalledOnce();
});

it('a delivered challenge survives its own intentional sign-out epoch change', async () => {
  const f = fixture(), attempt = f.controller.start('alice');
  const { result, effects } = f.run(attempt, async () => 'confirmed-challenge');
  expect(await result).toBe('confirmed-challenge'); expect(attempt.isCurrent()).toBe(true);
  expect(effects.signOut).toHaveBeenCalledOnce(); expect(effects.hydrate).not.toHaveBeenCalled(); expect(f.gate.end).toHaveBeenCalledOnce();
});

it.each(['switch', 'aba', 'same-uid-attempt'])('retires delayed confirmation after %s without signing out or hydrating', async change => {
  const f = fixture(), attempt = f.controller.start('alice'), response = deferred<string | null>();
  const { result, effects } = f.run(attempt, () => response.promise);
  if (change === 'same-uid-attempt') f.controller.start('alice');
  else { f.switchTo('bob'); if (change === 'aba') f.switchTo('alice'); }
  response.resolve('old-challenge'); await expect(result).rejects.toMatchObject({ code: 'auth-attempt-retired' });
  expect(effects.signOut).not.toHaveBeenCalled(); expect(effects.hydrate).not.toHaveBeenCalled(); expect(f.gate.end).not.toHaveBeenCalled();
});

it('a late failed request cannot sign out or release a newer same-account check', async () => {
  const f = fixture(), old = f.controller.start('alice'), response = deferred<string | null>();
  const { result, effects } = f.run(old, () => response.promise);
  const next = f.controller.start('alice');
  response.reject(Error('provider unavailable')); await expect(result).rejects.toThrow('provider unavailable');
  expect(next.isCurrent()).toBe(true); expect(effects.signOut).not.toHaveBeenCalled(); expect(f.gate.end).not.toHaveBeenCalled();
});

it('an active failure signs out just its account and preserves the original error', async () => {
  const f = fixture(), attempt = f.controller.start('alice'), error = Error('email unavailable');
  const { result, effects } = f.run(attempt, async () => { throw error; });
  await expect(result).rejects.toBe(error); expect(effects.signOut).toHaveBeenCalledOnce();
  expect(attempt.isCurrent()).toBe(true); expect(f.gate.end).toHaveBeenCalledOnce(); expect(effects.hydrate).not.toHaveBeenCalled();
});

it('old sign-out completion never adopts or cleans up a newer signed-in account', async () => {
  const f = fixture(), old = f.controller.start('alice'), signOut = deferred<void>(), cleanup = vi.fn(), hydrate = vi.fn();
  const result = completeAuthConfirmation(old, {
    check: async () => 'challenge', hydrate,
    signOut: async () => { old.guard(); await signOut.promise; old.signedOut(); cleanup(); },
  });
  await Promise.resolve(); f.switchTo('bob'); const next = f.controller.start('bob');
  signOut.resolve(); await expect(result).rejects.toMatchObject({ code: 'auth-attempt-retired' });
  expect(cleanup).not.toHaveBeenCalled(); expect(hydrate).not.toHaveBeenCalled(); expect(f.gate.end).not.toHaveBeenCalled(); expect(next.isCurrent()).toBe(true);
});

it('rejects a replacement account during sign-out even without another controller start', () => {
  const f = fixture(), attempt = f.controller.start('alice'); f.switchTo('bob');
  expect(() => attempt.signedOut()).toThrow(); expect(attempt.isCurrent()).toBe(false);
});

it('binds first-factor completion once and rejects stale same-UID password attempts', () => {
  const f = fixture(); f.switchTo(undefined);
  const old = f.controller.start(), current = f.controller.start(); f.switchTo('alice');
  expect(() => old.bindAuthenticated('alice')).toThrow();
  current.bindAuthenticated('alice'); expect(current.isCurrent()).toBe(true);
  f.switchTo('bob'); f.switchTo('alice'); expect(() => current.bindAuthenticated('alice')).toThrow(); expect(current.isCurrent()).toBe(false);
});

it('does not adopt an ABA account change while first-factor sign-in is pending', () => {
  const f = fixture(), attempt = f.controller.start();
  f.switchTo('bob'); f.switchTo('alice');
  expect(() => attempt.bindAuthenticated('alice')).toThrow();
  expect(f.gate.end).not.toHaveBeenCalled();
});

it('an explicit cancellation retires pending work and owns exactly one gate cleanup', async () => {
  const f = fixture(), attempt = f.controller.start('alice'), response = deferred<string | null>();
  const { result, effects } = f.run(attempt, () => response.promise);
  f.controller.retire(); f.controller.start('alice'); response.resolve(null);
  await expect(result).rejects.toMatchObject({ code: 'auth-attempt-retired' }); expect(effects.hydrate).not.toHaveBeenCalled(); expect(f.gate.end).toHaveBeenCalledOnce();
});

it('a stale OAuth session cannot retire a different account attempt', () => {
  const f = fixture(); f.switchTo('bob'); const current = f.controller.start('bob');
  expect(() => f.controller.start('alice')).toThrow(); expect(current.isCurrent()).toBe(true); expect(f.gate.begin).toHaveBeenCalledOnce();
});

it('retires delayed signed-out listeners even if the account returns to signed out', () => {
  let account: AuthAttemptSnapshot = { uid: undefined, epoch: 1 };
  const guard = captureAuthSnapshotGuard(() => account, undefined);
  expect(guard).not.toThrow();
  account = { uid: 'bob', epoch: 2 }; expect(guard).toThrow();
  account = { uid: undefined, epoch: 3 }; expect(guard).toThrow();
});
