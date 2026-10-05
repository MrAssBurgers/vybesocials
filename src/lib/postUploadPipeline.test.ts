import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), resolve: vi.fn(), check: vi.fn(), manage: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } } }));
vi.mock('@/lib/firebase/storageService', () => ({ firebaseStorage: { resolveDownloadUrl: mocks.resolve } }));
vi.mock('@/lib/contentModeration', () => ({ filterBlockedContent: (text: string) => text }));
vi.mock('@/lib/mediaOptimizer', () => ({ isVideoFile: () => true, optimizeForUpload: vi.fn(), generateVideoThumbnail: async () => null, getCompressedExtension: () => 'webp' }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: async () => undefined }));
vi.mock('@/lib/vybeCheck/runPublishVybeCheck', () => ({ runPublishVybeCheck: mocks.check }));
vi.mock('@/lib/rateLimit', () => ({ RATE_LIMITS: { createPost: () => true } }));
vi.mock('@/lib/aiDetection', () => ({ detectAIContent: async () => undefined }));
vi.mock('./postMutationService', () => ({ managePost: mocks.manage }));
vi.mock('./reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = mocks.epoch; return () => { if (uid !== mocks.uid || epoch !== mocks.epoch) throw new Error('Account changed'); }; } }));
import { runPostUpload } from './postUploadPipeline';
import { listPreparedPosts } from './postCreateAttempts';
const input = () => ({ profile: { id: 'profile-a', user_id: 'alice' }, clientPostId: crypto.randomUUID(), caption: 'Original', tags: ['test'], type: 'post' as const, mediaFile: new File(['video'], 'clip.mp4', { type: 'video/mp4' }) });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.uid = 'alice'; mocks.epoch = 1; mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null }); mocks.resolve.mockResolvedValue('https://example.com/clip.mp4'); mocks.check.mockResolvedValue({ allowed: true, blocked: false, ageRating: 'safe', checkId: 'check-a' }); mocks.manage.mockImplementation(async (actor, request) => ({ status: 'published', postId: request.postId, created: true, post: { ...request.payload, id: request.postId, authorId: actor.profileId } })); });
describe('checked upload pipeline', () => {
  it('publishes only resolved media with server-derived identity and an exact request', async () => {
    const draft = input(); const result = await runPostUpload(draft, () => {});
    expect(result).toMatchObject({ postId: draft.clientPostId, created: true, post: { author_id: 'profile-a', caption: 'Original' } });
    expect(mocks.manage).toHaveBeenCalledWith({ uid: 'alice', profileId: 'profile-a' }, expect.objectContaining({ action: 'create', postId: draft.clientPostId, requestId: expect.any(String), payload: expect.objectContaining({ mediaUrl: 'https://example.com/clip.mp4', vybeCheckId: 'check-a' }) }), expect.any(Function));
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.remove.mock.calls.flat(2).join(' ')).not.toContain('/posts/');
  });
  it('retries an unknown publication outcome without uploading or checking new content', async () => {
    const draft = input(); mocks.manage.mockRejectedValueOnce(new Error('Response lost'));
    expect(await runPostUpload(draft, () => {})).toEqual({ failed: true, reason: 'Response lost' });
    const first = mocks.manage.mock.calls[0][1];
    expect(listPreparedPosts('alice').some(row => row.postId === draft.clientPostId)).toBe(true);
    mocks.upload.mockClear(); mocks.check.mockClear();
    expect(await runPostUpload({ ...draft, caption: 'Changed draft after uncertainty' }, () => {})).toMatchObject({ post: { caption: 'Original' } });
    expect(mocks.manage.mock.calls[1][1]).toEqual(first); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.check).not.toHaveBeenCalled();
  });
  it('rejects an account ABA during upload before any public publication or cleanup under the new token', async () => {
    mocks.upload.mockImplementationOnce(async () => { mocks.epoch += 2; return { error: null }; });
    expect(await runPostUpload(input(), () => {})).toMatchObject({ failed: true, reason: 'Account changed' });
    expect(mocks.manage).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('keeps precise check failures and never submits a blocked post', async () => {
    mocks.check.mockResolvedValue({ allowed: false, blocked: true, message: 'Please revise this post.' });
    expect(await runPostUpload(input(), () => {})).toEqual({ failed: true, reason: 'Please revise this post.' });
    expect(mocks.manage).not.toHaveBeenCalled(); expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
