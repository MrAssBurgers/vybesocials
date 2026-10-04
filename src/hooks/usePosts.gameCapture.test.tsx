import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(), save: vi.fn(), capture: vi.fn(), check: vi.fn(), activity: vi.fn(), invalidate: vi.fn(),
  insert: vi.fn(), remove: vi.fn(), detect: vi.fn(), credit: vi.fn(), toastError: vi.fn(), accountEpoch: 0,
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => options,
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'profile', user_id: 'player' } }) }));
vi.mock('@/lib/firebase', () => ({ db: {
  from: () => ({ insert: mocks.insert }),
  storage: { from: () => ({ remove: mocks.remove }) },
} }));
vi.mock('@/lib/contentModeration', () => ({ containsBlockedContent: () => ({ blocked: false }), filterBlockedContent: (value: string) => value }));
vi.mock('@/lib/mediaOptimizer', () => ({ optimizeForUpload: vi.fn(), isVideoFile: vi.fn(), generateVideoThumbnail: vi.fn(), getCompressedExtension: vi.fn() }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: vi.fn() }));
vi.mock('@/lib/profileCache', () => ({ setCachedProfiles: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ resolveAuthorIds: vi.fn(), fetchMemberProfiles: vi.fn() }));
vi.mock('@/lib/firebase/users', () => ({ getUserProfile: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocuments: vi.fn(), getDocumentsFromServer: vi.fn(), where: vi.fn(), firestoreLimit: vi.fn() }));
vi.mock('@/lib/vybeCheck/runPublishVybeCheck', () => ({ runPublishVybeCheck: mocks.check }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: mocks.activity, challengeTypeForPost: () => 'post' }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenMarketplaceRequest: mocks.credit, tokenAccountGuard: () => { const started = mocks.accountEpoch; return () => { if (mocks.accountEpoch !== started) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/gameCaptureService', () => ({ getGameCapture: mocks.capture }));
vi.mock('@/lib/gameCapturePost', () => ({ findGameCapturePost: mocks.find, saveGameCapturePost: mocks.save }));
vi.mock('@/lib/rateLimit', () => ({ RATE_LIMITS: { createPost: () => true } }));
vi.mock('@/lib/aiDetection', () => ({ detectAIContent: mocks.detect }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, message: vi.fn() } }));

import { useCreatePost } from './usePosts';

const variables = { type: 'post' as const, caption: '', tags: [], gameCaptureId: 'a'.repeat(48) };
const post = { id: `game_${variables.gameCaptureId}`, author_id: 'profile', game_capture_id: variables.gameCaptureId };
type Mutation = {
  mutationFn: (data: typeof variables | Omit<typeof variables, 'gameCaptureId'>) => Promise<typeof post>;
  onSuccess: (data: typeof post, variables: typeof variables | Omit<typeof variables, 'gameCaptureId'>) => void;
  onError: (error: Error) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountEpoch = 0;
  mocks.credit.mockResolvedValue({ success: true, balance: 10, credited: 10 });
  mocks.capture.mockResolvedValue({ status: 'ready' });
  mocks.find.mockResolvedValue(null);
  mocks.save.mockResolvedValue({ post, created: true });
  mocks.check.mockResolvedValue({ allowed: true, blocked: false, ageRating: 'safe' });
  mocks.detect.mockResolvedValue({ is_ai: false });
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'ordinary-post' }, error: null }) }) });
});
afterEach(() => vi.restoreAllMocks());

describe('game capture publish challenge credit', () => {
  it('repeated recovery returns the existing post without awarding activity or republishing', async () => {
    mocks.find.mockResolvedValue(post);
    const { result } = renderHook(() => useCreatePost());
    const mutation = result.current as unknown as Mutation;
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await mutation.mutationFn(variables);
      expect(existing.id).toBe(post.id);
      mutation.onSuccess(existing, variables);
    }
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it('awards activity only to the transaction winner when both tabs found no post', async () => {
    mocks.save.mockResolvedValueOnce({ post, created: true }).mockResolvedValueOnce({ post, created: false });
    const first = renderHook(() => useCreatePost());
    const second = renderHook(() => useCreatePost());
    const firstMutation = first.result.current as unknown as Mutation;
    const secondMutation = second.result.current as unknown as Mutation;
    // Both preflight reads return null; the transaction resolves the second
    // tab as a reuse, regardless of the order its success callback arrives.
    const winner = await firstMutation.mutationFn(variables);
    const reused = await secondMutation.mutationFn(variables);
    firstMutation.onSuccess(winner, variables);
    secondMutation.onSuccess(reused, variables);
    expect(winner.id).toBe(reused.id);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith('profile', 'post');
    expect(JSON.parse(JSON.stringify(reused))).toEqual(post);
  });

  it('continues to award activity for an ordinary new post', async () => {
    const { result } = renderHook(() => useCreatePost());
    const mutation = result.current as unknown as Mutation;
    const ordinary = { type: 'post' as const, caption: '', tags: [] };
    const created = await mutation.mutationFn(ordinary);
    mutation.onSuccess(created, ordinary);
    expect(created.id).toBe('ordinary-post');
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith('profile', 'post');
    expect(mocks.credit).toHaveBeenCalledWith({ action: 'earn', type: 'post_created', referenceId: 'ordinary-post' }, expect.any(Function));
  });
  it('does not credit or show stale success after an account switch and return', async () => {
    const { result } = renderHook(useCreatePost);
    const mutation = result.current as unknown as Mutation;
    const created = await mutation.mutationFn(variables);
    mocks.accountEpoch += 2;
    mutation.onSuccess(created, variables);
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('does not publish when the account changes during the content check', async () => {
    mocks.check.mockImplementation(async () => { mocks.accountEpoch++; return { allowed: true, blocked: false, ageRating: 'safe' }; });
    const { result } = renderHook(useCreatePost);
    await expect((result.current as unknown as Mutation).mutationFn(variables)).rejects.toThrow('Account changed');
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.credit).not.toHaveBeenCalled();
  });
  it.each([
    'Vybe Check is unavailable right now. Your content has not been published. Please try again later.',
    'Revise the prohibited content.',
  ])('preserves a blocked check message without posting or a contradictory second toast', async message => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.check.mockResolvedValue({ allowed: false, blocked: true, ageRating: 'safe', message });
    const { result } = renderHook(useCreatePost); const mutation = result.current as unknown as Mutation;
    const error = await mutation.mutationFn(variables).catch(cause => cause);
    expect(error).toBeInstanceOf(Error); expect(error.message).toBe(message);
    mutation.onError(error);
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.activity).not.toHaveBeenCalled();
  });
  it('gives neutral retry guidance for unrelated write failures instead of assuming sign-in is broken', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(useCreatePost);
    (result.current as unknown as Mutation).onError(new Error('Storage temporarily unavailable'));
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith('Could not create your post. Please try again.');
  });
  it('does not replace the mutation\'s explicit missing-auth guidance with another toast', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(useCreatePost);
    (result.current as unknown as Mutation).onError(new Error('Not authenticated'));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
