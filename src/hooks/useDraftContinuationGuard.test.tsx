import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', owner: 'alice', auth: null as any, listener: null as any }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.uid ? { id: state.uid } : null, profile: { id: `${state.owner}-profile`, user_id: state.owner } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
import { useDraftContinuationGuard } from './useDraftContinuationGuard';
beforeEach(() => { state.uid = state.owner = 'alice'; state.listener = null; state.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (callback: unknown) => { state.listener = callback; return () => {}; } }; });
afterEach(cleanup);
it('allows completion for an unchanged mounted draft', () => {
  const hook = renderHook(() => useDraftContinuationGuard('post:draft')); const current = hook.result.current();
  hook.rerender(); expect(current()).toBe(true);
});
it('rejects completion after the draft changes, including changing back', () => {
  const hook = renderHook(({ scope }) => useDraftContinuationGuard(scope), { initialProps: { scope: 'post:original' } }); const current = hook.result.current();
  hook.rerender({ scope: 'post:new text' }); expect(current()).toBe(false);
  hook.rerender({ scope: 'post:original' }); expect(current()).toBe(false);
  expect(hook.result.current()()).toBe(true);
});
it('rejects completion after unmount', () => {
  const hook = renderHook(() => useDraftContinuationGuard('post')); const current = hook.result.current(); hook.unmount(); expect(current()).toBe(false);
});
it('rejects an away-and-back account switch even without a component rerender', () => {
  const hook = renderHook(() => useDraftContinuationGuard('post')); const current = hook.result.current();
  act(() => { for(const uid of ['bob', 'alice']) { state.auth.currentUser = { uid }; state.listener(state.auth.currentUser); } });
  expect(current()).toBe(false);
});
it.each(['signed-out','stale-profile'])('rejects %s ownership before starting work', mode => {
  if(mode === 'signed-out') state.uid = ''; else state.owner = 'bob';
  const hook = renderHook(() => useDraftContinuationGuard('post')); expect(hook.result.current()()).toBe(false);
});
