import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoryMediaCheckpoint, publishStoryMedia } from './publishStoryMedia';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, upload: vi.fn(), url: vi.fn(), compress: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: state.upload }) } } }));
vi.mock('@/lib/firebase/storageService', () => ({ firebaseStorage: { resolveDownloadUrl: state.url } }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => {
  if (state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed');
}; } }));
vi.mock('@/lib/storyUtils', () => ({ compressImage: state.compress, generateStoryFileName: (uid: string) => `${uid}/main.jpg`,
  generateStoryThumbnailFileName: (uid: string) => `${uid}/cover.jpg`, storyUploadContentType: () => 'image/jpeg' }));
const input = () => ({ file: new File(['image'], 'photo.jpg', { type: 'image/jpeg' }), isVideo: false, expectedOwnerUid: 'alice', checkpoint: createStoryMediaCheckpoint() });
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch = 1;
  state.compress.mockImplementation(async file => file); state.upload.mockResolvedValue({ error: null }); state.url.mockResolvedValue('https://owned/media'); });
describe('resumable story media stages', () => {
  it('reuses uploaded bytes when URL retrieval fails', async () => {
    const params = input(); state.url.mockResolvedValueOnce(null);
    await expect(publishStoryMedia(params)).rejects.toThrow('Retry to finish');
    await expect(publishStoryMedia(params)).resolves.toMatchObject({ mediaUrl: 'https://owned/media' });
    expect(state.upload).toHaveBeenCalledOnce(); expect(state.compress).toHaveBeenCalledOnce();
  });
  it('retries the selected cover without uploading the main media again', async () => {
    const params = { ...input(), thumbnailBlob: new Blob(['cover']) };
    state.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'offline' } });
    await expect(publishStoryMedia(params)).rejects.toThrow('chosen cover');
    await publishStoryMedia(params);
    expect(state.upload.mock.calls.map(call => call[0])).toEqual(['alice/main.jpg', 'alice/cover.jpg', 'alice/cover.jpg']);
  });
  it('shares in-flight upload work when a caller retries while it remains pending', async () => {
    let resolve!: (value: { error: null }) => void;
    state.upload.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    const params = input(); const first = publishStoryMedia(params); await Promise.resolve(); await Promise.resolve();
    const retry = publishStoryMedia(params); await Promise.resolve();
    expect(state.upload).toHaveBeenCalledOnce(); resolve({ error: null }); await Promise.all([first, retry]);
  });
  it('rejects replacing the draft media or owner inside an existing checkpoint', async () => {
    const params = input(); await publishStoryMedia(params);
    await expect(publishStoryMedia({ ...params, file: new File(['other'], 'other.jpg') })).rejects.toThrow('new story');
    state.uid = 'bob'; state.epoch++;
    await expect(publishStoryMedia({ ...params, expectedOwnerUid: 'bob' })).rejects.toThrow('new story');
    expect(state.upload).toHaveBeenCalledOnce();
  });
  it('blocks later upload stages and progress after an account ABA during compression', async () => {
    state.compress.mockImplementation(async file => { state.epoch += 2; return file; }); const progress = vi.fn();
    await expect(publishStoryMedia({ ...input(), onProgress: progress })).rejects.toThrow('Account changed');
    expect(state.upload).not.toHaveBeenCalled(); expect(progress).not.toHaveBeenCalled();
  });
  it('blocks cover and URL reads after account change during main upload', async () => {
    state.upload.mockImplementationOnce(async () => { state.uid = 'bob'; state.epoch++; return { error: null }; });
    await expect(publishStoryMedia({ ...input(), thumbnailBlob: new Blob(['cover']) })).rejects.toThrow('Account changed');
    expect(state.upload).toHaveBeenCalledOnce(); expect(state.url).not.toHaveBeenCalled();
  });
});
