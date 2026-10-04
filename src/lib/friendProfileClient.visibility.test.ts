import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ single: vi.fn(), invoke: vi.fn(), auth: { currentUser: { uid: 'alice' } as { uid: string } | null, onAuthStateChanged: vi.fn() } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => { state.invoke(...args); return { single: state.single }; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
import { resolveProfileVisibility } from './friendProfileClient';
import { PROFILE_VISIBILITY_DEFAULTS, PROFILE_VISIBILITY_FIELDS } from './profileVisibility';
import { reportAccountSnapshot } from './reportModerationService';
const input = { targetId: 'target', expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' };
const response = () => ({ ok: true, ownerUid: 'alice', viewerProfileId: 'alice-profile', targetProfileId: 'target',
  fields: Object.fromEntries(PROFILE_VISIBILITY_FIELDS.map(field => [field, PROFILE_VISIBILITY_DEFAULTS[field] === 'public'])),
  settings: { ...PROFILE_VISIBILITY_DEFAULTS }, isSelf: false, isFriend: false, isBlocked: false });
beforeEach(() => { vi.clearAllMocks(); state.auth.currentUser = { uid: 'alice' }; reportAccountSnapshot(); state.single.mockResolvedValue({ data: response(), error: null }); });
describe('verified profile visibility client', () => {
  it('sends both actor identities and accepts only a complete bound response', async () => {
    const result = await resolveProfileVisibility(input);
    expect(result.fields.bio).toBe(false); expect(result.fields.posts).toBe(true);
    expect(state.invoke).toHaveBeenCalledWith('resolve-profile-visibility', { target_id: 'target', expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' });
  });
  it.each(['ownerUid', 'viewerProfileId', 'targetProfileId'])('rejects a response for another %s', async key => {
    state.single.mockResolvedValue({ data: { ...response(), [key]: 'different' } });
    await expect(resolveProfileVisibility(input)).rejects.toThrow('could not be confirmed');
  });
  it.each([null, {}, { ...response(), fields: { posts: true } }, { ...response(), fields: { ...response().fields, bio: 'true' } }, { ...response(), settings: { ...response().settings, bio: 'strangers' } }, { ...response(), isSelf: true }, { ...response(), isBlocked: true }, { ...response(), fields: { ...response().fields, bio: true } }])('rejects incomplete or contradictory authority %#', async data => {
    state.single.mockResolvedValue({ data }); await expect(resolveProfileVisibility(input)).rejects.toThrow('could not be confirmed');
  });
  it('preserves unavailable denial rather than inventing defaults', async () => {
    const data = response(); data.settings.bio = 'unavailable' as never;
    state.single.mockResolvedValue({ data }); expect((await resolveProfileVisibility(input)).fields.bio).toBe(false);
  });
  it('throws provider failure without returning a permissive map', async () => {
    state.single.mockResolvedValue({ error: { message: 'Unavailable', name: 'unavailable' } });
    await expect(resolveProfileVisibility(input)).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('rejects ABA completions even when the UID matches again', async () => {
    let finish!: (value: unknown) => void; state.single.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = resolveProfileVisibility(input);
    state.auth.currentUser = { uid: 'bob' }; reportAccountSnapshot(); state.auth.currentUser = { uid: 'alice' }; reportAccountSnapshot();
    finish({ data: response() }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('refuses a stale actor before transport', async () => {
    state.auth.currentUser = { uid: 'bob' };
    await expect(resolveProfileVisibility(input)).rejects.toMatchObject({ code: 'account-changed' }); expect(state.invoke).not.toHaveBeenCalled();
  });
});
