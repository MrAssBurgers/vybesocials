import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'creator' as string | undefined,
  authUid: 'creator' as string | undefined,
  read: vi.fn(), update: vi.fn(), insert: vi.fn(), invalidate: vi.fn(),
  success: vi.fn(), error: vi.fn(), filters: [] as Array<[string, unknown]>,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => options,
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock('@/lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: mocks.authUid ? { uid: mocks.authUid } : null }),
  db: {
    from: (table: string) => {
      expect(table).toBe('creator_profiles');
      const selection = {
        eq: (field: string, value: unknown) => { mocks.filters.push([field, value]); return selection; },
        limit: (count: number) => { expect(count).toBe(2); return mocks.read(); },
      };
      return {
        select: () => selection,
        update: (payload: unknown) => {
          const filters: Array<[string, unknown]> = [];
          const update = {
            eq: (field: string, value: unknown) => { filters.push([field, value]); return update; },
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              mocks.update(payload, filters).then(resolve, reject),
          };
          return update;
        },
        insert: mocks.insert,
      };
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { useApplyForPartner } from './useCreatorProfile';

type Application = { id: string; user_id: string; is_approved?: boolean; applied_at: string; updated_at: string };
type Mutation = {
  onMutate: () => string | undefined;
  mutationFn: () => Promise<Application>;
  onSuccess: (data: Application) => void;
  onError: (error: unknown, variables: undefined, uid: string | undefined) => void;
};
const existing = {
  id: 'legacy-creator-row', user_id: 'creator', is_approved: true,
  created_at: '2020-01-01T00:00:00Z', stripe_account_id: 'acct_existing', balance: 40,
};
const hook = () => renderHook(() => useApplyForPartner());
const mutation = (result: ReturnType<typeof hook>['result']) => result.current as unknown as Mutation;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = 'creator';
  mocks.authUid = 'creator';
  mocks.filters = [];
  mocks.read.mockResolvedValue({ data: [existing], error: null });
  mocks.update.mockResolvedValue({ data: [existing], error: null });
  mocks.insert.mockResolvedValue({ data: null, error: null });
});

describe('creator application ownership and payment preservation', () => {
  it('updates an imported profile without rewriting approval, payment, identity, or creation fields', async () => {
    const { result } = hook();
    const applied = await mutation(result).mutationFn();
    expect(mocks.filters).toEqual([['user_id', 'creator']]);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      applied_at: expect.any(String), updated_at: expect.any(String),
    }, [['id', 'legacy-creator-row'], ['user_id', 'creator']]);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(applied).toMatchObject(existing);
  });

  it('retries an existing application without resetting its original creation date or approval', async () => {
    const { result } = hook();
    await mutation(result).mutationFn();
    await mutation(result).mutationFn();
    expect(mocks.update).toHaveBeenCalledTimes(2);
    for (const [payload] of mocks.update.mock.calls) {
      expect(Object.keys(payload).sort()).toEqual(['applied_at', 'updated_at']);
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('adds a pending flag only when a legacy application has no approval field', async () => {
    const legacy = { id: 'legacy-row', user_id: 'creator', stripe_account_id: 'acct_existing' };
    mocks.read.mockResolvedValue({ data: [legacy], error: null });
    mocks.update.mockResolvedValue({ data: [legacy], error: null });
    const { result } = hook();
    const applied = await mutation(result).mutationFn();
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      applied_at: expect.any(String), updated_at: expect.any(String), is_approved: false,
    }, [['id', 'legacy-row'], ['user_id', 'creator']]);
    expect(applied.is_approved).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([true, false, null])('does not patch an existing approval field (%s)', async isApproved => {
    mocks.read.mockResolvedValue({ data: [{ ...existing, is_approved: isApproved }], error: null });
    const { result } = hook();
    const applied = await mutation(result).mutationFn();
    const [payload] = mocks.update.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['applied_at', 'updated_at']);
    expect(applied.is_approved).toBe(isApproved);
  });

  it('creates a canonical pending application that appears in the staff pending query', async () => {
    mocks.read.mockResolvedValue({ data: [], error: null });
    const { result } = hook();
    const applied = await mutation(result).mutationFn();
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      id: 'creator', user_id: 'creator', is_approved: false,
      applied_at: expect.any(String), updated_at: expect.any(String),
    });
    expect(applied.is_approved).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    mutation(result).onSuccess(applied);
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: ['creator-profile', 'creator'] });
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it('refuses ambiguous migrated rows instead of creating or editing an arbitrary payment profile', async () => {
    mocks.read.mockResolvedValue({ data: [existing, { ...existing, id: 'second-row' }], error: null });
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toThrow('needs review');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([{}, { ...existing, user_id: 'someone-else' }])('refuses malformed or mismatched ownership from the lookup', async row => {
    mocks.read.mockResolvedValue({ data: [row], error: null });
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toThrow('needs review');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not interpret a failed lookup as an absent creator profile', async () => {
    const failure = new Error('Lookup unavailable');
    mocks.read.mockResolvedValue({ data: null, error: failure });
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toBe(failure);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stops if Firebase changes accounts during the profile lookup, even before React rerenders', async () => {
    let finish!: (value: unknown) => void;
    mocks.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = hook();
    const pending = mutation(result).mutationFn();
    mocks.authUid = 'other-account';
    finish({ data: [existing], error: null });
    await expect(pending).rejects.toThrow('account changed');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stops an old mutation when the auth context changes during its lookup', async () => {
    let finish!: (value: unknown) => void;
    mocks.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = hook();
    const pending = mutation(result).mutationFn();
    mocks.userId = 'other-account';
    rerender();
    finish({ data: [], error: null });
    await expect(pending).rejects.toThrow('account changed');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not report success if the existing row disappeared before the filtered update', async () => {
    mocks.update.mockResolvedValue({ data: [], error: null });
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toThrow('profile changed');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('propagates a rejected concurrent canonical insert without overwriting it with another write', async () => {
    const failure = new Error('permission-denied: creator profile changed');
    mocks.read.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockResolvedValue({ data: null, error: failure });
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toBe(failure);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('suppresses another account’s late success and error notices', async () => {
    const { result } = hook();
    const operation = mutation(result);
    const context = operation.onMutate();
    const applied = await operation.mutationFn();
    mocks.authUid = 'other-account';
    operation.onSuccess(applied);
    operation.onError(new Error('late failure'), undefined, context);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('requires a current authenticated account before reading or writing', async () => {
    mocks.userId = undefined;
    mocks.authUid = undefined;
    const { result } = hook();
    await expect(mutation(result).mutationFn()).rejects.toThrow('Not authenticated');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
