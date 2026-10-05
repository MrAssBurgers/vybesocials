import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), parent: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => ({ select: () => ({ eq: (field: string, id: string) => ({
  maybeSingle: () => state.read(table, field, id), limit: (limit: number) => state.read(table, field, id, limit),
}) }) }) } }));
vi.mock('@/lib/commentService', () => ({ readCommentParent: state.parent }));
import { contentFlagContextPath, hasContentFlagContext } from './contentFlagContext';
const identity = { expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' };
beforeEach(() => { state.read.mockReset(); state.parent.mockReset(); });

describe('legacy flag context routes', () => {
  it.each([['post', '/p/target'], ['clip', '/p/target'], ['mini_app', '/mini-apps/target']])('uses the exact %s route', async (content_type, path) => {
    expect(await contentFlagContextPath({ content_type, content_id: 'target' }, () => {})).toBe(path);
    expect(state.read).not.toHaveBeenCalled();
  });
  it.each(['message', 'story', 'comment-forged', 'unknown'])('never guesses a route or reads context for %s', async content_type => {
    expect(hasContentFlagContext({ content_type, content_id: 'target' })).toBe(false);
    expect(await contentFlagContextPath({ content_type, content_id: 'target' }, () => {})).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
  });
  it.each(['../admin', 'target?other=1', 'target#other', '', '..'])('rejects malformed navigation ID %s', async content_id => {
    expect(await contentFlagContextPath({ content_type: 'post', content_id }, () => {})).toBeNull();
  });
  it('resolves a profile ID to its current username', async () => {
    state.read.mockResolvedValue({ data: { username: 'current.name' }, error: null });
    expect(await contentFlagContextPath({ content_type: 'profile', content_id: 'profile-id' }, () => {})).toBe('/u/current.name');
    expect(state.read).toHaveBeenCalledWith('profiles', 'id', 'profile-id');
  });
  it('resolves a Firebase UID only when it maps to exactly one profile', async () => {
    state.read.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: [{ username: 'alice' }], error: null });
    expect(await contentFlagContextPath({ content_type: 'profile', content_id: 'auth-id' }, () => {})).toBe('/u/alice');
    expect(state.read).toHaveBeenLastCalledWith('profiles', 'user_id', 'auth-id', 2);
    state.read.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: [{ username: 'a' }, { username: 'b' }], error: null });
    expect(await contentFlagContextPath({ content_type: 'profile', content_id: 'auth-id' }, () => {})).toBeNull();
  });
  it('opens a comment through its checked parent reference and propagates failed reads', async () => {
    state.parent.mockResolvedValueOnce('parent').mockRejectedValueOnce(new Error('Denied'));
    const flag = { content_type: 'comment', content_id: 'comment-id' };
    expect(await contentFlagContextPath(flag, () => {}, identity)).toBe('/p/parent#comment-comment-id');
    await expect(contentFlagContextPath(flag, () => {}, identity)).rejects.toThrow('Denied');
  });
  it('does not return context after the account guard changes during a lookup', async () => {
    let active = true;
    state.parent.mockImplementation(async () => { active = false; return 'parent'; });
    await expect(contentFlagContextPath({ content_type: 'comment', content_id: 'comment-id' }, () => { if (!active) throw new Error('Account changed'); }, identity)).rejects.toThrow('Account changed');
  });
});
