import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryComposer } from './useStoryComposer';

const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, save: vi.fn(), check: vi.fn(), upload: vi.fn(), validate: vi.fn(), thumbnail: vi.fn() }));
vi.mock('./useStories', () => ({ useCreateStory: () => ({ mutateAsync: state.save }) }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: (uid: string) => {
  const epoch = state.session.epoch;
  return () => { if (state.session.uid !== uid || epoch !== state.session.epoch) throw new Error('Account changed'); };
} }));
vi.mock('@/lib/vybeCheck', () => ({ runPublishVybeCheck: state.check }));
vi.mock('@/lib/publishStoryMedia', () => ({ publishStoryMedia: state.upload, createStoryMediaCheckpoint: () => ({}) }));
vi.mock('@/lib/storyUtils', () => ({ validateStoryMedia: state.validate, generateStoryThumbnail: state.thumbnail }));
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const input = () => ({ file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), isVideo: false, caption: ' Original ', isCloseFriendsOnly: true,
  pollData: { type: 'poll' as const, question: 'Choose?', options: ['A', 'B'] } });
beforeEach(() => {
  vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 };
  state.validate.mockResolvedValue({ valid: true, aspectRatio: 0.75, duration: null });
  state.check.mockResolvedValue({ allowed: true, blocked: false });
  state.upload.mockResolvedValue({ mediaUrl: 'https://owned/photo', thumbnailUrl: 'https://owned/cover' });
  state.save.mockResolvedValue({ id: 'story' }); state.thumbnail.mockResolvedValue(new Blob(['cover']));
});
afterEach(() => { vi.useRealTimers(); });

describe('explicit story composer submission', () => {
  it('does no provider or upload work on mount', () => {
    renderHook(useStoryComposer);
    expect(state.check).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  });
  it('rejects an old submit closure after an account ABA before React rerenders', async () => {
    const { result } = renderHook(useStoryComposer);
    const previousSubmit = result.current.submit;
    state.session = { uid: 'alice', epoch: 3 };
    await expect(previousSubmit(input())).rejects.toThrow('account changed');
    expect(state.validate).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  });
  it('retries an unknown save with the same request, URLs, audience and snapshot without reupload', async () => {
    state.save.mockRejectedValueOnce(new Error('Lost response'));
    const { result } = renderHook(useStoryComposer); const original = input();
    await act(async () => { await expect(result.current.submit(original)).rejects.toThrow('Lost response'); });
    expect(result.current.locked).toBe(true); expect(result.current.busy).toBe(false);
    original.pollData.options[0] = 'Changed later';
    await act(async () => { await result.current.submit({ ...original, caption: 'Changed', isCloseFriendsOnly: false }); });
    const first = state.save.mock.calls[0][0], retry = state.save.mock.calls[1][0];
    expect(retry).toMatchObject({ requestId: first.requestId, expectedOwnerUid: 'alice', caption: 'Original', isCloseFriendsOnly: true,
      mediaUrl: 'https://owned/photo', thumbnailUrl: 'https://owned/cover', pollData: { options: ['A', 'B'] } });
    expect(state.check).toHaveBeenCalledTimes(1); expect(state.upload).toHaveBeenCalledTimes(1);
  });
  it('synchronously prevents double submit before React updates busy state', async () => {
    const pending = deferred<{ allowed: boolean }>(); state.check.mockReturnValue(pending.promise);
    const { result } = renderHook(useStoryComposer); let first!: Promise<unknown>;
    await act(async () => { first = result.current.submit(input()); expect(await result.current.submit(input())).toBeUndefined(); });
    pending.resolve({ allowed: true }); await act(async () => { await first; });
    expect(state.check).toHaveBeenCalledTimes(1); expect(state.save).toHaveBeenCalledTimes(1);
  });
  it('only explicit reset starts another request and upload', async () => {
    state.save.mockRejectedValueOnce(new Error('Lost response'));
    const { result } = renderHook(useStoryComposer);
    await act(async () => { await expect(result.current.submit(input())).rejects.toThrow(); });
    act(() => result.current.reset());
    await act(async () => { await result.current.submit({ ...input(), caption: 'New story' }); });
    expect(state.save.mock.calls[1][0].requestId).not.toBe(state.save.mock.calls[0][0].requestId);
    expect(state.save.mock.calls[1][0].caption).toBe('New story'); expect(state.upload).toHaveBeenCalledTimes(2);
  });
  it('preserves the draft through a real UI timeout and recovers the same request', async () => {
    vi.useFakeTimers(); const pending = deferred<{ id: string }>(); state.save.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useStoryComposer); let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.submit(input()).catch(error => error); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('may have been saved') }));
    pending.resolve({ id: 'story' }); await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.submit(input()); });
    expect(state.save).toHaveBeenCalledTimes(1); expect(state.upload).toHaveBeenCalledTimes(1);
  });
  it('keeps the retry state after a preparation timeout while retaining late upload work for the next attempt', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ mediaUrl: string; thumbnailUrl: string }>();
    let uploadProgress!: (value: number) => void;
    state.upload.mockImplementationOnce((params: { onProgress: (value: number) => void }) => {
      uploadProgress = params.onProgress;
      return pending.promise;
    });
    const progress = vi.fn(); const retryProgress = vi.fn();
    const { result } = renderHook(useStoryComposer); let outcome!: Promise<unknown>;
    await act(async () => { outcome = result.current.submit(input(), progress).catch(error => error); });
    expect(state.upload).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(300_001); });
    expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('Retry to check its progress') }));
    expect(result.current.busy).toBe(false); expect(result.current.locked).toBe(true);
    const previousCalls = progress.mock.calls.length;
    await act(async () => {
      uploadProgress(70); uploadProgress(85);
      pending.resolve({ mediaUrl: 'https://owned/photo', thumbnailUrl: 'https://owned/cover' });
    });
    expect(progress).toHaveBeenCalledTimes(previousCalls); expect(state.save).not.toHaveBeenCalled();
    await act(async () => { await result.current.submit(input(), retryProgress); });
    expect(state.upload).toHaveBeenCalledOnce(); expect(state.check).toHaveBeenCalledOnce(); expect(state.save).toHaveBeenCalledOnce();
    expect(retryProgress).toHaveBeenCalledWith('saving', 85);
    expect(progress).toHaveBeenCalledTimes(previousCalls);
  });
  it('finishes the story after the editor unmounts so it can be deleted', async () => {
    const pending = deferred<{ allowed: boolean }>(); state.check.mockReturnValue(pending.promise);
    const view = renderHook(useStoryComposer); let outcome!: Promise<unknown>;
    await act(async () => { outcome = view.result.current.submit(input()); });
    await waitFor(() => expect(state.check).toHaveBeenCalledOnce());
    view.unmount();
    pending.resolve({ allowed: true });
    await act(async () => { await expect(outcome).resolves.toMatchObject({ id: 'story' }); });
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.save).toHaveBeenCalledOnce();
  });
  it.each(['account switch', 'ABA'] as const)('stops a late moderation result after %s', async reason => {
    const pending = deferred<{ allowed: boolean }>(); state.check.mockReturnValue(pending.promise);
    const view = renderHook(useStoryComposer); let outcome!: Promise<unknown>;
    await act(async () => { outcome = view.result.current.submit(input()).catch(error => error); });
    await waitFor(() => expect(state.check).toHaveBeenCalledOnce());
    state.session = { uid: reason === 'ABA' ? 'alice' : 'bob', epoch: reason === 'ABA' ? 3 : 2 };
    pending.resolve({ allowed: true }); await act(async () => { expect(await outcome).toBeInstanceOf(Error); });
    expect(state.upload).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  });
  it('fails closed on moderation denial and permits retry without generating a new request', async () => {
    state.check.mockResolvedValueOnce({ allowed: false, message: 'Unavailable' });
    const { result } = renderHook(useStoryComposer);
    await act(async () => { await expect(result.current.submit(input())).rejects.toThrow('Unavailable'); });
    expect(result.current.busy).toBe(false); expect(state.upload).not.toHaveBeenCalled();
    await act(async () => { await result.current.submit(input()); });
    expect(state.save).toHaveBeenCalledOnce();
  });
});
