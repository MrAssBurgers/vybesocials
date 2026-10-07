import { describe, expect, it, vi, beforeEach } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, run: vi.fn(), pending: [] as unknown[] }));
vi.mock('@/lib/postUploadPipeline', () => ({ runPostUpload: state.run }));
vi.mock('./postCreateAttempts', () => ({ listPreparedPosts: () => state.pending }));
vi.mock('./reportModerationService', () => ({ reportAccountSubscribe: () => () => {}, reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (!uid || state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); }; } }));
import { enqueuePostUpload, getUploadJobs, retryUploadJob, dismissUploadJob } from './uploadQueue';
const input = () => ({ profile: { id: 'profile-a', user_id: 'alice' }, caption: 'Original', tags: [] as string[], type: 'post' as const });
const success = { postId: 'post-a', post: {}, created: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { state.uid = 'alice'; state.epoch++; state.pending = []; getUploadJobs().forEach(row => dismissUploadJob(row.id)); state.run.mockReset(); });
describe('owner-bound background publishing', () => {
  it('snapshots input and retains the same publication ID on explicit retry', async () => {
    state.run.mockResolvedValueOnce({ failed: true, reason: 'Response lost' }).mockResolvedValueOnce(success);
    const draft = input(), id = enqueuePostUpload(draft); draft.tags.push('edited');
    await vi.waitFor(() => expect(getUploadJobs()[0]?.stage).toBe('failed'));
    expect(retryUploadJob(id)).toBe(true);
    await vi.waitFor(() => expect(getUploadJobs()[0]?.stage).toBe('done'));
    expect(state.run.mock.calls[0][0].clientPostId).toBe(state.run.mock.calls[1][0].clientPostId);
    expect(state.run.mock.calls[0][0].tags).toEqual([]);
  });
  it('hides Alice uploads from Bob and rejects cross-account enqueue and retry', () => {
    state.run.mockImplementation(() => new Promise(() => {})); const id = enqueuePostUpload(input());
    state.uid = 'bob'; state.epoch++; expect(getUploadJobs()).toEqual([]); expect(retryUploadJob(id)).toBe(false);
    expect(() => enqueuePostUpload(input())).toThrow('Account changed');
  });
  it('an old ABA completion cannot clobber a newer explicit retry', async () => {
    const old = deferred<typeof success>(), current = deferred<typeof success>();
    state.run.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const id = enqueuePostUpload(input());
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(1));
    state.uid = 'bob'; state.epoch++; getUploadJobs(); state.uid = 'alice'; state.epoch++;
    expect(getUploadJobs()[0]?.stage).toBe('failed'); expect(retryUploadJob(id)).toBe(true);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    old.resolve(success); await new Promise(resolve => setTimeout(resolve, 0));
    expect(getUploadJobs()[0]?.stage).toBe('optimizing');
    current.resolve(success); await vi.waitFor(() => expect(getUploadJobs()[0]?.stage).toBe('done'));
  });
  it('recovers exact prepared publications for their owner after reload without auto-submitting', () => {
    state.pending = [{ actor: { uid: 'alice', profileId: 'profile-a' }, postId: crypto.randomUUID(), preparedAt: 1, payload: { caption: 'Retained', tags: [], type: 'post' } }]; state.epoch++;
    const jobs = getUploadJobs(); expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ stage: 'failed', input: { caption: 'Retained' } }); expect(state.run).not.toHaveBeenCalled();
  });
  it('returns a stable snapshot while nothing changes', () => { const first = getUploadJobs(); expect(getUploadJobs()).toBe(first); });
  it('keeps a publish exception instead of describing it as an account change', async () => {
    state.run.mockRejectedValueOnce(new Error('Vybe Check is unavailable right now.'));
    enqueuePostUpload(input());
    await vi.waitFor(() => expect(getUploadJobs()[0]?.error).toBe('Vybe Check is unavailable right now.'));
  });
  it('still names an account change when the attempt is retired', async () => {
    state.run.mockRejectedValueOnce(Object.assign(new Error('stop'), { code: 'account-changed' }));
    enqueuePostUpload(input());
    await vi.waitFor(() => expect(getUploadJobs()[0]?.error).toBe('Your account changed. Retry this original publication after signing back in.'));
  });
});
