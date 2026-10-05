import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), activity: vi.fn(), invalidate: vi.fn(), credit: vi.fn(), toastError: vi.fn(), epoch: 1 }));
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options, useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => { const epoch = mocks.epoch; return { user: { id: 'player' }, profile: { id: 'profile', user_id: 'player' }, session: { uid: 'player', epoch }, ready: true, guard: () => { if (mocks.epoch !== epoch) throw new Error('Account changed'); } }; } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'profile', user_id: 'player' } }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('./useSocialFeed', () => ({ useSocialFeed: vi.fn() }));
vi.mock('./useSocialPostList', () => ({ useSocialPostList: vi.fn() }));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: vi.fn() }));
vi.mock('@/lib/postUploadPipeline', () => ({ runPostUpload: mocks.upload }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: mocks.activity, challengeTypeForPost: () => 'post' }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenMarketplaceRequest: mocks.credit }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
import { useCreatePost } from './usePosts';
const variables = { type: 'post' as const, caption: '', tags: [], gameCaptureId: 'a'.repeat(48) };
const post = { id: `game_${variables.gameCaptureId}`, author_id: 'profile', game_capture_id: variables.gameCaptureId };
type Variables = { type: 'post'; caption: string; tags: string[]; gameCaptureId?: string };
type Mutation = { mutationFn: (data: Variables) => Promise<typeof post>; onSuccess: (data: typeof post, variables: Variables) => void; onError: (error: Error) => void };
beforeEach(() => { vi.clearAllMocks(); mocks.epoch = 1; mocks.credit.mockResolvedValue({ success: true }); mocks.upload.mockResolvedValue({ postId: post.id, post, created: true }); });
describe('checked create post hook', () => {
  it('does not award challenge activity for a recovered capture receipt', async () => {
    mocks.upload.mockResolvedValue({ postId: post.id, post, created: false });
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    const result = await mutation.mutationFn(variables); mutation.onSuccess(result, variables);
    expect(mocks.activity).not.toHaveBeenCalled(); expect(mocks.invalidate).toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(result))).toEqual(post);
  });
  it('awards activity only to a newly created post and uses the actual ID for verified credit', async () => {
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    const result = await mutation.mutationFn(variables); mutation.onSuccess(result, variables);
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith('profile', 'post');
    expect(mocks.credit).toHaveBeenCalledWith({ action: 'earn', type: 'post_created', referenceId: post.id }, expect.any(Function));
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ profile: { id: 'profile', user_id: 'player' }, clientPostId: post.id });
  });
  it('keeps the same ordinary post ID after a failed attempt but changes it after success', async () => {
    const ordinary = { type: 'post' as const, caption: 'Hello', tags: [] };
    mocks.upload.mockResolvedValueOnce({ failed: true, reason: 'Response lost' });
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    await expect(mutation.mutationFn(ordinary)).rejects.toThrow('Response lost');
    await mutation.mutationFn(ordinary); await mutation.mutationFn(ordinary);
    const ids = mocks.upload.mock.calls.map(call => call[0].clientPostId);
    expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[1]);
  });
  it('suppresses activity, invalidation and credit after account ABA', async () => {
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    const result = await mutation.mutationFn(variables); mocks.epoch += 2; mutation.onSuccess(result, variables);
    expect(mocks.credit).not.toHaveBeenCalled(); expect(mocks.activity).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('checks captured context again after the asynchronous publisher resolves', async () => {
    mocks.upload.mockImplementation(async () => { mocks.epoch++; return { postId: post.id, post, created: true }; });
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    await expect(mutation.mutationFn(variables)).rejects.toThrow('Account changed');
  });
  it('suppresses all post callbacks once the publisher unmounts', async () => {
    const view = renderHook(useCreatePost), mutation = view.result.current as unknown as Mutation;
    const result = await mutation.mutationFn(variables); view.unmount(); mutation.onSuccess(result, variables); mutation.onError(new Error('Late failure'));
    expect(mocks.invalidate).not.toHaveBeenCalled(); expect(mocks.toastError).not.toHaveBeenCalled();
  });
  it('keeps the actual safety or server error instead of false success', async () => {
    mocks.upload.mockResolvedValue({ failed: true, reason: 'Please revise this post.' });
    const mutation = renderHook(useCreatePost).result.current as unknown as Mutation;
    const error = await mutation.mutationFn(variables).catch(error => error); mutation.onError(error);
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Please revise this post.'); expect(mocks.credit).not.toHaveBeenCalled();
  });
});
