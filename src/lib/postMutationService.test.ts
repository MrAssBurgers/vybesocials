import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { managePost, postMutationAttempt, type PostMutationRequest } from './postMutationService';
const actor = { uid: 'alice', profileId: 'profile-alice' }, requestId = '51a0f9dd-7f1f-4bad-ae55-6e549c13d7e7';
const request: PostMutationRequest = { action: 'update', postId: 'post', expectedRevision: 'a'.repeat(48), requestId, payload: { caption: 'Changed' } };
const post = { id: 'post', authorId: actor.profileId, createdAt: '2026-10-04T12:00:00.000Z', isPinned: false, aiOverride: null, type: 'post', caption: 'Changed', tags: [], mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'followers' };
const receipt = { ok: true, ownerUid: actor.uid, profileId: actor.profileId, action: 'update', postId: 'post', requestId, revision: 'b'.repeat(48), status: 'published', post, needsOwnerConfirmation: false, created: false, unpinnedPostIds: [] };
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.invoke.mockResolvedValue({ data: receipt, error: null }); });
it('confirms only the matching account, action, request and current publication', async () => {
  const guard = vi.fn(); const result = await managePost(actor, request, guard);
  expect(result.post?.visibility).toBe('followers'); expect(guard).toHaveBeenCalledTimes(2);
  expect(state.invoke).toHaveBeenCalledWith('managePost', { ...request, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
});
it.each([
  { ownerUid: 'bob' }, { profileId: 'profile-bob' }, { action: 'pin' }, { postId: 'different' }, { requestId: crypto.randomUUID() },
  { revision: null }, { status: 'deleted' }, { needsOwnerConfirmation: true }, { created: true }, { unpinnedPostIds: ['other'] },
  { post: { ...post, authorId: 'profile-bob' } }, { post: { ...post, mediaUrl: 'http://example.test/private' } },
])('rejects an unbound or contradictory receipt %j', async patch => {
  state.invoke.mockResolvedValue({ data: { ...receipt, ...patch } }); await expect(managePost(actor, request, () => {})).rejects.toThrow();
});
it('only the deliberate staff read parser accepts another author in a server-authorized read', async () => {
  state.invoke.mockResolvedValue({ data: { ...receipt, action: 'read', requestId: null, post: { ...post, authorId: 'bob-profile' } } });
  await expect(managePost(actor, { action: 'read', postId: 'post' }, () => {})).rejects.toThrow();
  expect((await managePost(actor, { action: 'read', postId: 'post' }, () => {}, { allowStaffRead: true })).post?.authorId).toBe('bob-profile');
});
it('rejects a late response after its originating account retires', async () => {
  const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Account changed'); });
  await expect(managePost(actor, request, guard)).rejects.toThrow('Account changed');
});
it.each([{ caption: 'Old words' }, { tags: ['different'] }, { aiOverride: false }])('rejects a matching receipt with unsaved fields %j', async changed => {
  const payload = { caption: 'Changed', tags: ['new'], aiOverride: true };
  state.invoke.mockResolvedValue({ data: { ...receipt, post: { ...post, ...payload, ...changed } } });
  await expect(managePost(actor, { ...request, payload }, () => {})).rejects.toThrow('does not confirm');
});
it('requires the requested pin and deletion states', async () => {
  state.invoke.mockResolvedValue({ data: { ...receipt, action: 'pin' } });
  await expect(managePost(actor, { ...request, action: 'pin', payload: { isPinned: true } }, () => {})).rejects.toThrow('does not confirm');
  state.invoke.mockResolvedValue({ data: { ...receipt, action: 'delete' } });
  await expect(managePost(actor, { action: 'delete', postId: 'post', requestId, expectedRevision: request.expectedRevision }, () => {})).rejects.toThrow('does not confirm');
});
it('checks published content and permits only the server safety-rating normalization', async () => {
  const payload = { type: 'post' as const, caption: post.caption, tags: [], mediaUrl: null, mediaUrls: [], thumbnailUrl: null, visibility: 'followers' as const, ageRating: 'safe' as const };
  const create = { action: 'create' as const, postId: 'post', requestId, payload };
  state.invoke.mockResolvedValue({ data: { ...receipt, action: 'create', created: true } });
  expect((await managePost(actor, create, () => {})).post?.ageRating).toBe('unrated');
  state.invoke.mockResolvedValue({ data: { ...receipt, action: 'create', created: true, post: { ...post, visibility: 'public' } } });
  await expect(managePost(actor, create, () => {})).rejects.toThrow('does not confirm');
});
it('retains retry identity but does not store the caption or media in mutation-attempt metadata', async () => {
  const draft = { action: 'update' as const, postId: crypto.randomUUID(), expectedRevision: 'a'.repeat(48), payload: { caption: 'Private draft words' } };
  const first = await postMutationAttempt(actor, draft), second = await postMutationAttempt(actor, draft);
  expect(first.requestId).toBe(second.requestId); expect(sessionStorage.getItem('vybe-post-mutation-attempts-v1')).not.toContain('Private draft words');
  expect((await postMutationAttempt(actor, { ...draft, expectedRevision: 'b'.repeat(48) })).requestId).not.toBe(first.requestId);
  first.complete(); expect((await postMutationAttempt(actor, draft)).requestId).not.toBe(first.requestId);
});
