import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, compress: vi.fn(), thumbnail: vi.fn(), upload: vi.fn(), url: vi.fn(), insert: vi.fn(), author: vi.fn(), activity: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (expected = state.uid) => { const epoch = state.epoch; return () => {
  if (state.uid !== expected || state.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
}; }, isReportSessionError: (error: { code?: string }) => error?.code === 'account-changed' }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: state.upload, getPublicUrl: () => ({ data: { publicUrl: 'gs://ignored' } }) }) }, from: () => ({ insert: state.insert }) } }));
vi.mock('@/lib/firebase/storageService', () => ({ firebaseStorage: { resolveDownloadUrl: state.url } }));
vi.mock('@/lib/storyUtils', () => ({ compressImage: state.compress, generateStoryThumbnail: state.thumbnail }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveStoryAuthorProfileId: state.author }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: state.activity }));
import { uploadSnapMedia } from './uploadSnapMedia';
import { createStoryRecord } from './createStoryRecord';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const file = () => new File(['private'], 'snap.jpg', { type: 'image/jpeg' });
const story = { mediaUrl: 'https://media.invalid/alice/snap.jpg', mediaType: 'photo' as const, destination: 'my_story' as const };
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; for (const fn of [state.compress, state.thumbnail, state.upload, state.url, state.insert, state.author, state.activity]) fn.mockReset();
  state.compress.mockImplementation(async value => value); state.upload.mockResolvedValue({ error: null }); state.url.mockResolvedValue('https://media.invalid/alice/snap.jpg');
  state.thumbnail.mockResolvedValue(new Blob(['thumb'], { type: 'image/jpeg' })); state.author.mockResolvedValue('alice-profile'); state.insert.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('camera helper account boundaries', () => {
  it('does not start uploading after an account changed while compressing', async () => {
    const compression = deferred<File>(); state.compress.mockReturnValue(compression.promise);
    const pending = uploadSnapMedia({ file: file(), isVideo: false, authUserId: 'alice' });
    state.uid = 'bob'; state.epoch++; compression.resolve(file());
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.upload).not.toHaveBeenCalled();
  });
  it('does not continue media processing after an upload acknowledgement arrives in a new session', async () => {
    const upload = deferred<{ error: null }>(); state.upload.mockReturnValue(upload.promise);
    const pending = uploadSnapMedia({ file: file(), isVideo: true, authUserId: 'alice' });
    state.uid = 'bob'; state.epoch++; upload.resolve({ error: null });
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.url).not.toHaveBeenCalled(); expect(state.thumbnail).not.toHaveBeenCalled();
  });
  it('does not upload a generated cover after logout/login of the same account', async () => {
    const thumbnail = deferred<Blob>(); state.thumbnail.mockReturnValue(thumbnail.promise);
    const pending = uploadSnapMedia({ file: file(), isVideo: true, authUserId: 'alice' });
    await vi.waitFor(() => expect(state.thumbnail).toHaveBeenCalled()); state.epoch += 2; thumbnail.resolve(new Blob(['cover']));
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.upload).toHaveBeenCalledTimes(1);
  });
  it('publishes only the job’s verified profile without resolving another current profile', async () => {
    await createStoryRecord({ ...story, authorId: 'alice-profile' });
    expect(state.author).not.toHaveBeenCalled(); expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ author_id: 'alice-profile' }));
    expect(state.activity).toHaveBeenCalledWith('alice-profile', 'story');
  });
  it('stops a legacy unbound story after its profile lookup changes accounts', async () => {
    const author = deferred<string>(); state.author.mockReturnValue(author.promise);
    const pending = createStoryRecord(story); state.uid = 'bob'; state.epoch++; author.resolve('bob-profile');
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.insert).not.toHaveBeenCalled();
  });
  it('does not record activity after a late story acknowledgement crosses accounts', async () => {
    const insert = deferred<{ error: null }>(); state.insert.mockReturnValue(insert.promise);
    const pending = createStoryRecord({ ...story, authorId: 'alice-profile' }); state.uid = 'bob'; state.epoch++; insert.resolve({ error: null });
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.activity).not.toHaveBeenCalled();
  });
});
