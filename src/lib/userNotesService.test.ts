import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
import { readOwnNote, readFriendsNotesPage, changeOwnNote, validNoteGifUrl } from './userNotesService';
const identity = { expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' };
const now = Date.parse('2026-10-04T12:00:00Z');
const sample = { id: 'bob', user_id: 'bob', content: 'Hello', gif_url: null, created_at: new Date(now).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
  profile: { id: 'bob-profile', username: 'bob', display_name: 'Bob', avatar_url: null } };
const page = () => ({ ownerUid: 'alice', viewerProfileId: 'alice-profile', checkedAt: now, notes: [sample], nextCursor: null });
beforeEach(() => { vi.clearAllMocks(); mock.invoke.mockResolvedValue({ data: page(), error: null }); });
afterEach(() => vi.useRealTimers());
describe('checked note transport', () => {
  it('reads only the server-authorized friend projection', async () => {
    const result = await readFriendsNotesPage(identity, vi.fn());
    expect(result.notes).toEqual([sample]); expect(mock.invoke).toHaveBeenCalledWith('getFriendsNotes', identity);
  });
  it.each(['permission-denied', 'not-found', 'unavailable'])('keeps %s a retryable failure instead of an empty list', async code => {
    mock.invoke.mockResolvedValue({ data: null, error: { code, message: code } });
    await expect(readFriendsNotesPage(identity, vi.fn())).rejects.toThrow(code);
  });
  it.each([{ ownerUid: 'bob' }, { viewerProfileId: 'other' }, { notes: [{ ...sample, secret: 'private' }] },
    { notes: [{ ...sample, expires_at: new Date(now).toISOString() }] }, { notes: [{ ...sample, content: 'x'.repeat(61) }] },
    { notes: [{ ...sample, gif_url: 'https://example.test/track.gif' }] }, { notes: [sample, sample] }])('rejects an invalid or mismatched page', async patch => {
    mock.invoke.mockResolvedValue({ data: { ...page(), ...patch }, error: null });
    await expect(readFriendsNotesPage(identity, vi.fn())).rejects.toThrow();
  });
  it('drops late aborted or changed-account results', async () => {
    const abort = new AbortController();
    mock.invoke.mockImplementation(async () => { abort.abort(); return { data: page(), error: null }; });
    await expect(readFriendsNotesPage(identity, vi.fn(), abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Account changed'); });
    await expect(readFriendsNotesPage(identity, guard)).rejects.toThrow('Account changed');
  });
  it('expires its lease from dispatch time and exposes read timeouts', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = readFriendsNotesPage(identity, vi.fn());
    await vi.advanceTimersByTimeAsync(5000); finish({ data: page(), error: null });
    expect((await pending).leaseUntil).toBe(now + 30000);
    mock.invoke.mockReturnValue(new Promise(() => {}));
    const expired = expect(readOwnNote(identity, vi.fn())).rejects.toThrow('retry');
    await vi.advanceTimersByTimeAsync(15000); await expired;
  });
  it('requires matching write acknowledgement rather than accepting legacy null success', async () => {
    const input = { ...identity, action: 'delete' as const, expectedRevision: null, requestId: 'delete-one' };
    mock.invoke.mockResolvedValueOnce({ data: null, error: null });
    await expect(changeOwnNote(input, vi.fn())).rejects.toThrow('not confirmed');
    mock.invoke.mockResolvedValueOnce({ data: { success: true, ownerUid: 'alice', viewerProfileId: 'alice-profile', action: 'delete', requestId: 'delete-one', revision: 'a'.repeat(48) }, error: null });
    await expect(changeOwnNote(input, vi.fn())).resolves.toMatchObject({ success: true });
  });
  it('accepts only credential-free HTTPS GIF media from GIPHY', () => {
    expect(validNoteGifUrl('https://media.giphy.com/media/x/giphy.gif')).toBe(true);
    for (const value of ['https://giphy.com.evil.test/x', 'javascript:alert(1)', 'https://user:pass@giphy.com/x', 'http://media.giphy.com/x']) expect(validNoteGifUrl(value)).toBe(false);
  });
});
