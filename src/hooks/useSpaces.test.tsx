import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ request: vi.fn(), mutation: vi.fn(), actor: { uid: 'owner', profileId: 'profile', epoch: 1 }, valid: true }));
vi.mock('@/hooks/useSpaceActor', () => ({ useSpaceActor: () => ({ actor: mocks.valid ? mocks.actor : null, key: [mocks.actor.uid, mocks.actor.epoch, mocks.actor.profileId], capture: () => { if (!mocks.valid) throw new Error('Sign in'); const actor = mocks.actor; return { actor, guard: () => { if (actor !== mocks.actor) throw new Error('Account changed'); } }; } }) }));
vi.mock('@/lib/spaceAuthorityClient', () => ({ spaceAuthorityRequest: mocks.request, spaceMutation: mocks.mutation }));
import { useSpace, useSpaceParticipants, useJoinSpace, useUpdateParticipantRole, useEndSpace, useStartSpace } from '@/hooks/useSpaces';
const read = () => ({ space: { id: 'room', revision: 7 }, participants: [{ id: 'target', revision: 4 }], participant: { id: 'own', revision: 3, left_at: null } });
function setup() { const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>; return { cache, wrapper }; }
beforeEach(() => { vi.clearAllMocks(); mocks.valid = true; mocks.actor = { uid: 'owner', profileId: 'profile', epoch: 1 }; mocks.request.mockResolvedValue(read()); mocks.mutation.mockResolvedValue({ ok: true }); });
it('shares one authoritative read between the room and participant hooks', async () => {
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => ({ room: useSpace('room'), members: useSpaceParticipants('room') }), { wrapper });
  await waitFor(() => expect(result.current.room.data?.id).toBe('room'));
  expect(result.current.members.data?.[0].id).toBe('target'); expect(mocks.request).toHaveBeenCalledTimes(1);
  unmount(); cache.clear();
});
it('join uses own revision and never substitutes a host role', async () => {
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => useJoinSpace(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ spaceId: 'room' }); });
  expect(mocks.mutation).toHaveBeenCalledWith(mocks.actor, 'join', { spaceId: 'room', role: 'listener' }, 3);
  unmount(); cache.clear();
});
it('host role assignment uses the target revision; end uses room revision', async () => {
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => ({ role: useUpdateParticipantRole(), end: useEndSpace() }), { wrapper });
  await act(async () => { await result.current.role.mutateAsync({ spaceId: 'room', participantId: 'target', role: 'speaker' }); await result.current.end.mutateAsync('room'); });
  expect(mocks.mutation.mock.calls.map(c => [c[1], c[3]])).toEqual([['role', 4], ['end', 7]]);
  unmount(); cache.clear();
});
it('missing target fails before submitting a host change', async () => {
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => useUpdateParticipantRole(), { wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ spaceId: 'room', participantId: 'absent', role: 'speaker' })).rejects.toThrow('Refresh the participants'); });
  expect(mocks.mutation).not.toHaveBeenCalled(); unmount(); cache.clear();
});
it('read failure remains an error instead of becoming an empty room', async () => {
  mocks.request.mockRejectedValue(new Error('Connection failed'));
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => useSpace('room'), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined(); expect(result.current.error?.message).toBe('Connection failed'); unmount(); cache.clear();
});

it('hides cached room data while the account profile is unavailable', async () => {
  const { wrapper, cache } = setup(); const { result, rerender, unmount } = renderHook(() => useSpace('room'), { wrapper });
  await waitFor(() => expect(result.current.data?.id).toBe('room'));
  mocks.valid = false; rerender(); expect(result.current.data).toBeUndefined(); unmount(); cache.clear();
});

it('scheduled start uses the room revision rather than the host membership revision', async () => {
  const { wrapper, cache } = setup(); const { result, unmount } = renderHook(() => useStartSpace(), { wrapper });
  await act(async () => { await result.current.mutateAsync('room'); });
  expect(mocks.mutation).toHaveBeenCalledWith(mocks.actor, 'start', { spaceId: 'room' }, 7);
  unmount(); cache.clear();
});
