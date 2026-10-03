import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(), save: vi.fn(), capture: vi.fn(), check: vi.fn(), activity: vi.fn(), invalidate: vi.fn(),
  insert: vi.fn(), remove: vi.fn(), detect: vi.fn(),
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
vi.mock('@/lib/gameCaptureService', () => ({ getGameCapture: mocks.capture }));
vi.mock('@/lib/gameCapturePost', () => ({ findGameCapturePost: mocks.find, saveGameCapturePost: mocks.save }));
vi.mock('@/lib/rateLimit', () => ({ RATE_LIMITS: { createPost: () => true } }));
vi.mock('@/lib/aiDetection', () => ({ detectAIContent: mocks.detect }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

import { useCreatePost } from './usePosts';

const variables = { type: 'post' as const, caption: '', tags: [], gameCaptureId: 'a'.repeat(48) };
const post = { id: `game_${variables.gameCaptureId}`, author_id: 'profile', game_capture_id: variables.gameCaptureId };
type Mutation = {
  mutationFn: (data: typeof variables | Omit<typeof variables, 'gameCaptureId'>) => Promise<typeof post>;
  onSuccess: (data: typeof post, variables: typeof variables | Omit<typeof variables, 'gameCaptureId'>) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capture.mockResolvedValue({ status: 'ready' });
  mocks.find.mockResolvedValue(null);
  mocks.save.mockResolvedValue({ post, created: true });
  mocks.check.mockResolvedValue({ allowed: true, blocked: false, ageRating: 'safe' });
  mocks.detect.mockResolvedValue({ is_ai: false });
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'ordinary-post' }, error: null }) }) });
});

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
  });
});
