import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => {
  if (state.uid !== uid || state.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
}; } }));
import { publishStory, type StoryPublishParams } from './storyPublishService';
const input = (): StoryPublishParams => ({ expectedOwnerUid: 'alice', requestId: 'draft-one', authorId: 'alice-profile', mediaUrl: 'https://media.test/alice.jpg', mediaType: 'image', caption: 'Test' });
const id = `story_${'a'.repeat(64)}`;
const receipt = (patch = {}) => ({ success: true, status: 'published', created: true, storyId: id, ownerUid: 'alice', requestId: 'draft-one', destination: 'my_story',
  story: { id, author_id: 'alice-profile', media_url: input().mediaUrl, media_type: 'image', thumbnail_url: null, caption: 'Test', is_close_friends_only: false,
    aspect_ratio: 0.5625, duration: null, view_count: 0, created_at: '2026-10-04T10:00:00.000Z', expires_at: '2026-10-05T10:00:00.000Z', poll_data: null,
    author: { id: 'alice-profile', username: 'Alice', avatar_url: null, display_name: null } }, ...patch });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.invoke.mockReset(); state.invoke.mockResolvedValue({ data: receipt(), error: null }); });
describe('story publish callable boundary', () => {
  it('rejects a mismatched poll and accepts server-trimmed poll text', async () => {
    const value = { ...input(), pollData: { type: 'poll', question: ' Pick ', options: [' A ', ' B '] } };
    await expect(publishStory(value)).rejects.toMatchObject({ code: 'invalid-response' });
    state.invoke.mockResolvedValue({ data: receipt({ story: { ...receipt().story, poll_data: { type: 'poll', question: 'Pick', options: ['A', 'B'] } } }), error: null });
    expect((await publishStory(value)).created).toBe(true);
  });
  it('sends the stable request and owner binding without callback functions', async () => {
    const guard = vi.fn(); const result = await publishStory({ ...input(), accountGuard: guard });
    expect(result).toMatchObject({ created: true, story: { id } });
    expect(state.invoke).toHaveBeenCalledWith('publishStory', input()); expect(guard).toHaveBeenCalled();
  });
  it('reports replay without pretending another story was created', async () => {
    state.invoke.mockResolvedValue({ data: receipt({ created: false }), error: null });
    expect((await publishStory(input())).created).toBe(false);
  });
  it.each(['deleted', 'expired'])('does not treat a consumed %s receipt as a newly visible story', async status => {
    state.invoke.mockResolvedValue({ data: receipt({ status, created: false, story: null }), error: null });
    await expect(publishStory(input())).rejects.toMatchObject({ code: `story-${status}`, message: expect.stringContaining('not been reposted') });
  });
  it.each([null, { success: false }, receipt({ ownerUid: 'bob' }), receipt({ requestId: 'different' }), receipt({ destination: 'close_friends' }), receipt({ story: { ...receipt().story, author_id: 'bob-profile' } }), receipt({ story: { ...receipt().story, media_url: 'https://other.test/file.jpg' } })])('rejects an unconfirmed or mismatched response: %o', async data => {
    state.invoke.mockResolvedValue({ data, error: null }); await expect(publishStory(input())).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it.each(['unavailable', 'deadline-exceeded', 'not-found'])('retains a useful retry message for %s without direct fallback', async code => {
    state.invoke.mockResolvedValue({ data: null, error: { code, message: 'raw provider failure' } });
    await expect(publishStory(input())).rejects.toThrow('same request will not create a second story'); expect(state.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('suppresses a late account completion, including ABA=%s', async aba => {
    const pending = deferred<unknown>(); state.invoke.mockReturnValue(pending.promise); const result = publishStory(input());
    state.uid = 'bob'; state.epoch++; if (aba) { state.uid = 'alice'; state.epoch++; }
    pending.resolve({ data: receipt(), error: null }); await expect(result).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('copies caller-owned nested payloads before dispatch', async () => {
    const pending = deferred<unknown>(); state.invoke.mockReturnValue(pending.promise);
    const value = { ...input(), pollData: { type: 'question', question: 'Original?', options: [] } };
    const result = publishStory(value); value.pollData.question = 'Changed';
    expect(state.invoke.mock.calls[0][1].pollData.question).toBe('Original?');
    pending.resolve({ data: receipt({ story: { ...receipt().story, poll_data: { type: 'question', question: 'Original?', options: [] } } }), error: null }); await result;
  });
});
