// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { checkedSpaceAuthBatch } from '../../functions/src/_shared/spaceAuthBatch';
const user = (uid: string, disabled = false) => ({ uid, disabled, metadata: { creationTime: '2026-10-06T00:00:00Z' } });
it('uses at most two batches of 100 and maps unordered users by UID', async () => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn(async (ids: {uid:string}[]) => ({ users: ids.map(id => user(id.uid)).reverse(), notFound: [] })) };
  const ids = Array.from({ length: 200 }, (_, i) => `user-${i}`);
  const checked = await checkedSpaceAuthBatch(auth as any, [...ids, ids[0]]);
  expect(auth.getUsers.mock.calls.map(c => c[0].length)).toEqual([100, 100]);
  expect((await checked.getUser(ids[0])).uid).toBe(ids[0]); expect((await checked.getUser(ids[199])).uid).toBe(ids[199]); expect(auth.getUser).not.toHaveBeenCalled();
});
it('retains disabled status and returns explicit absence as user-not-found', async () => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn(async () => ({ users: [user('disabled', true)], notFound: [{ uid: 'gone' }] })) };
  const checked = await checkedSpaceAuthBatch(auth as any, ['disabled', 'gone']);
  expect((await checked.getUser('disabled')).disabled).toBe(true); await expect(checked.getUser('gone')).rejects.toMatchObject({ code: 'auth/user-not-found' });
});
it.each([
  { users: [], notFound: [] },
  { users: [user('wrong')], notFound: [] },
  { users: [user('expected'), user('expected')], notFound: [] },
  { users: [user('expected')], notFound: [{ uid: 'expected' }] },
  { users: [], notFound: [{ email: 'not-a-uid@example.test' }] },
])('rejects malformed or incomplete provider results', async response => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn(async () => response) };
  await expect(checkedSpaceAuthBatch(auth as any, ['expected'])).rejects.toMatchObject({ code: 'unavailable' }); expect(auth.getUser).not.toHaveBeenCalled();
});
it('batch transport failure remains an error instead of hiding all participants', async () => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn(async () => { throw new Error('network'); }) };
  await expect(checkedSpaceAuthBatch(auth as any, ['expected'])).rejects.toMatchObject({ code: 'unavailable' });
});
it('does not reuse an account result between read attempts', async () => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn().mockResolvedValueOnce({ users: [user('expected')], notFound: [] }).mockResolvedValueOnce({ users: [user('expected', true)], notFound: [] }) };
  const first = await checkedSpaceAuthBatch(auth as any, ['expected']); const second = await checkedSpaceAuthBatch(auth as any, ['expected']);
  expect((await first.getUser('expected')).disabled).toBe(false); expect((await second.getUser('expected')).disabled).toBe(true); expect(auth.getUsers).toHaveBeenCalledTimes(2);
});
it('allows bounded single-user adapters without a batch API', async () => {
  const auth = { getUser: vi.fn() }; expect(await checkedSpaceAuthBatch(auth, ['expected'])).toBe(auth);
});
it('rejects more than the room capacity or invalid identities before the batch', async () => {
  const auth = { getUser: vi.fn(), getUsers: vi.fn() };
  await expect(checkedSpaceAuthBatch(auth as any, Array.from({ length: 201 }, (_, i) => `u${i}`))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(checkedSpaceAuthBatch(auth as any, ['bad/uid'])).rejects.toMatchObject({ code: 'failed-precondition' }); expect(auth.getUsers).not.toHaveBeenCalled();
});
