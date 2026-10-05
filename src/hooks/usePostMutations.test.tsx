import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, invoke: vi.fn() }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { session: { uid, epoch }, profile: { id: `profile-${uid}` }, ready: true, guard: () => {
    if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed');
  } };
} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { usePostMutations } from './usePostMutations';
const draft = { action: 'update' as const, postId: 'post', expectedRevision: 'a'.repeat(48), payload: { caption: 'New caption' } };
function receipt(body: Record<string, unknown>, caption = 'New caption') {
  return { data: { ok: true, ownerUid: body.expectedOwnerUid, profileId: body.expectedProfileId, action: body.action, postId: body.postId,
    requestId: body.requestId, revision: 'b'.repeat(48), status: 'published', created: false, needsOwnerConfirmation: false, unpinnedPostIds: [],
    post: { id: body.postId, authorId: body.expectedProfileId, createdAt: '2026-10-04T12:00:00.000Z', type: 'post', caption, tags: [], mediaUrl: null,
      mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public', isPinned: false, aiOverride: null } } };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(({ view }) => usePostMutations(view), { initialProps: { view: 'post' }, wrapper: ({ children }: {children: ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...hook, invalidate };
}
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.uid = 'alice'; state.epoch++; });
it('locks double submission before the lazy service resolves and retains exact revision on retry', async () => {
  let resolve!: (value: unknown) => void;
  state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result } = setup();
  let first!: Promise<unknown>;
  act(() => { first = result.current.mutate(draft); });
  await expect(result.current.mutate(draft)).rejects.toThrow('still saving');
  await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
  const sent = state.invoke.mock.calls[0][1];
  await act(async () => { resolve({ error: { message: 'Lost reply' } }); await expect(first).rejects.toThrow('Lost reply'); });
  state.invoke.mockImplementation(async (_name, body) => receipt(body));
  await act(async () => { await result.current.mutate(draft); });
  expect(state.invoke.mock.calls[1][1]).toEqual(sent);
  expect(sent.expectedRevision).toBe(draft.expectedRevision);
});
it('keeps retry identity when a well-bound receipt does not contain the requested saved change', async () => {
  const { result, invalidate } = setup();
  state.invoke.mockImplementation(async (_name, body) => receipt(body, 'Old caption'));
  await act(async () => { await expect(result.current.mutate(draft)).rejects.toThrow('does not confirm'); });
  expect(invalidate).not.toHaveBeenCalled();
  const sent = state.invoke.mock.calls[0][1];
  state.invoke.mockImplementation(async (_name, body) => receipt(body));
  await act(async () => { await result.current.mutate(draft); });
  expect(state.invoke.mock.calls[1][1].requestId).toBe(sent.requestId);
  expect(invalidate).toHaveBeenCalled();
});
it.each(['account', 'view'])('retires a late result after the %s changes and returns', async kind => {
  let resolve!: (value: unknown) => void;
  state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result, rerender, invalidate } = setup();
  let pending!: Promise<unknown>;
  act(() => { pending = result.current.mutate(draft); });
  await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
  const sent = state.invoke.mock.calls[0][1];
  if (kind === 'account') { state.uid = 'bob'; state.epoch++; }
  rerender({ view: 'other' });
  if (kind === 'account') { state.uid = 'alice'; state.epoch++; }
  rerender({ view: 'post' });
  await act(async () => { resolve(receipt(sent)); await expect(pending).rejects.toThrow(/changed/); });
  expect(invalidate).not.toHaveBeenCalled();
  expect(result.current.isPending).toBe(false);
});
