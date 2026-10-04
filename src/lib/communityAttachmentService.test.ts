import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, invoke: vi.fn(), token: vi.fn(), fetch: vi.fn(), listeners: new Set<() => void>() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke, getFunctionUrl: (name: string) => `https://functions.invalid/${name}` }));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.session.uid, getIdToken: state.token } }) }));
vi.mock('@/lib/communityService', () => ({ communityAccountLease: (uid: string, session: typeof state.session) => () => {
  if (uid !== state.session.uid || session.epoch !== state.session.epoch) throw new Error('Account changed');
}, communityAccountSubscribe: (listener: () => void) => { state.listeners.add(listener); return () => state.listeners.delete(listener); } }));
import { fetchCommunityAttachment, sendCommunityAttachment, validateCommunityAttachment, type CommunityAttachmentDraft } from './communityAttachmentService';
const assetId = 'a'.repeat(64), messageId = `attachment_${assetId}`;
const file = () => new File(['abc'], 'photo.png', { type: 'image/png' });
const draft = (): CommunityAttachmentDraft => ({ requestId: 'stable-request-1234', file: file(), channelId: 'channel', content: 'Original caption', session: state.session });
const ack = (patch = {}) => ({ data: { success: true, assetId, ownerUid: 'alice', channelId: 'channel', messageId, objectPath: `community-private/alice/${assetId}/original`, byteSize: 3,
  contentType: 'image/png', status: 'uploading', expiresAt: Date.now() + 900000, ...patch }, error: null });
const uploaded = () => ack({ status: 'uploaded', objectPath: `community-private/alice/${assetId}/sealed_${'b'.repeat(32)}` });
const ready = () => ({ ...uploaded(), data: { ...uploaded().data, status: 'ready', message: { id: messageId, attachment_id: assetId, channel_id: 'channel', author_id: 'alice', media_url: null } } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => {
  vi.clearAllMocks(); state.listeners.clear(); state.session = { uid: 'alice', epoch: 1 }; state.token.mockResolvedValue('private-id-token'); vi.stubGlobal('fetch', state.fetch);
  state.fetch.mockImplementation(async () => new Response(JSON.stringify(uploaded().data), { headers: { 'Content-Type': 'application/json' } }));
});
afterEach(() => vi.unstubAllGlobals());
describe('private attachment upload requests', () => {
  it('validates actual allowed type and byte bounds before any reservation', () => {
    expect(() => validateCommunityAttachment(new File(['svg'], 'x.svg', { type: 'image/svg+xml' }))).toThrow('20 MiB');
    expect(() => validateCommunityAttachment(new File([], 'empty.png', { type: 'image/png' }))).toThrow();
    const large = file(); Object.defineProperty(large, 'size', { value: 20 * 1024 * 1024 + 1 }); expect(() => validateCommunityAttachment(large)).toThrow();
  });
  it('reserves, uploads immutable bytes, and acknowledges only finalized message', async () => {
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce(ack({ uploadRequired: true, message: null })).mockResolvedValueOnce(ready());
    const input = draft(); const progress = vi.fn(); await expect(sendCommunityAttachment(input, new AbortController().signal, progress)).resolves.toBe(messageId);
    expect(state.invoke.mock.calls[0]).toEqual(['communityAttachment', { action: 'reserve', expectedOwnerUid: 'alice', requestId: input.requestId, channelId: 'channel', content: 'Original caption', byteSize: 3, contentType: 'image/png' }]);
    expect(state.fetch).toHaveBeenCalledWith(`https://functions.invalid/communityAttachmentBytes/uploads/${assetId}`, expect.objectContaining({ method: 'PUT', body: input.file, cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer private-id-token', 'X-Vybe-Owner': 'alice', 'Content-Type': 'image/png' } }));
    expect(progress).toHaveBeenCalledWith(100); expect(state.listeners.size).toBe(0);
  });
  it('recovers a committed lost acknowledgement without uploading or publishing another message', async () => {
    const input = draft();
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce(ack({ uploadRequired: true })).mockResolvedValueOnce({ data: null, error: { message: 'Lost acknowledgement' } });
    await expect(sendCommunityAttachment(input, new AbortController().signal, () => {})).rejects.toThrow('Lost acknowledgement');
    state.invoke.mockResolvedValueOnce(ready()).mockResolvedValueOnce(ready());
    await expect(sendCommunityAttachment(input, new AbortController().signal, () => {})).resolves.toBe(messageId);
    expect(state.fetch).toHaveBeenCalledTimes(1); expect(state.invoke.mock.calls[3][1]).toEqual(state.invoke.mock.calls[0][1]);
  });
  it.each([{ ownerUid: 'bob' }, { objectPath: 'media/alice/public' }, { messageId: `attachment_${'b'.repeat(64)}` }])('rejects a reservation outside its bound tuple %j', async patch => {
    state.invoke.mockResolvedValue(ack(patch)); await expect(sendCommunityAttachment(draft(), new AbortController().signal, () => {})).rejects.toThrow('verified'); expect(state.fetch).not.toHaveBeenCalled();
  });
  it('rejects late reservation after account ABA before uploading', async () => {
    const pending = deferred<ReturnType<typeof ack>>(); state.invoke.mockReturnValue(pending.promise); const input = draft();
    const result = sendCommunityAttachment(input, new AbortController().signal, () => {}); state.session = { uid: 'alice', epoch: 3 }; pending.resolve(ack());
    await expect(result).rejects.toThrow('Account changed'); expect(state.fetch).not.toHaveBeenCalled();
  });
  it('does not acknowledge a ready response with a missing or unrelated message tuple', async () => {
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce({ ...ready(), data: { ...ready().data, message: true } });
    await expect(sendCommunityAttachment(draft(), new AbortController().signal, () => {})).rejects.toThrow('not been confirmed');
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('does not recover a different asset from finalize even with an otherwise valid tuple', async () => {
    const other = 'c'.repeat(64);
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce({ ...ready(), data: { ...ready().data, assetId: other, messageId: `attachment_${other}`, objectPath: `community-private/alice/${other}/sealed_${'b'.repeat(32)}` } });
    await expect(sendCommunityAttachment(draft(), new AbortController().signal, () => {})).rejects.toThrow('verified');
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('does not dispatch upload after delayed token retrieval crosses an account epoch', async () => {
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce(ack({ uploadRequired: true }));
    const pending = deferred<string>(); state.token.mockReturnValue(pending.promise);
    const result = sendCommunityAttachment(draft(), new AbortController().signal, () => {});
    await vi.waitFor(() => expect(state.token).toHaveBeenCalled()); state.session = { uid: 'alice', epoch: 3 }; pending.resolve('old-token');
    await expect(result).rejects.toThrow('Account changed'); expect(state.fetch).not.toHaveBeenCalled(); expect(state.listeners.size).toBe(0);
  });
  it('does not finalize an unbound successful HTTP acknowledgement', async () => {
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce(ack({ uploadRequired: true }));
    state.fetch.mockResolvedValue(new Response(JSON.stringify({ ...uploaded().data, assetId: 'c'.repeat(64) })));
    await expect(sendCommunityAttachment(draft(), new AbortController().signal, () => {})).rejects.toThrow('verified'); expect(state.invoke).toHaveBeenCalledTimes(2);
  });
  it('cancels an active upload immediately on an account transition', async () => {
    state.invoke.mockResolvedValueOnce(ack()).mockResolvedValueOnce(ack({ uploadRequired: true }));
    state.fetch.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true })));
    const result = sendCommunityAttachment(draft(), new AbortController().signal, () => {});
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalled()); state.session = { uid: 'bob', epoch: 2 }; state.listeners.forEach(listener => listener());
    await expect(result).rejects.toThrow('Cancelled'); expect(state.fetch.mock.calls[0][1].signal.aborted).toBe(true); expect(state.invoke).toHaveBeenCalledTimes(2); expect(state.listeners.size).toBe(0);
  });
});
describe('authenticated bounded media reads', () => {
  it('uses header auth only, no cache, and returns validated private bytes', async () => {
    state.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png', 'Content-Length': '3' } }));
    const result = await fetchCommunityAttachment(messageId, state.session, new AbortController().signal);
    expect(result?.size).toBe(3); const [url, options] = state.fetch.mock.calls[0]; expect(url).toBe(`https://functions.invalid/communityAttachmentBytes/${messageId}`);
    expect(options).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer private-id-token', 'X-Vybe-Owner': 'alice' } });
  });
  it('does not dispatch after delayed token retrieval crosses an account epoch', async () => {
    const pending = deferred<string>(); state.token.mockReturnValue(pending.promise); const result = fetchCommunityAttachment(messageId, state.session, new AbortController().signal);
    state.session = { uid: 'alice', epoch: 3 }; pending.resolve('private-id-token'); await expect(result).rejects.toThrow('Account changed'); expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([{ type: 'text/html', length: '3', body: [1, 2, 3] }, { type: 'image/png', length: '2', body: [1, 2, 3] }, { type: 'video/mp4', length: '4', body: [1, 2, 3] }])('refuses malformed, oversized or incomplete response %j', async ({ type, length, body }) => {
    state.fetch.mockResolvedValue(new Response(new Uint8Array(body), { headers: { 'Content-Type': type, 'Content-Length': length } }));
    await expect(fetchCommunityAttachment(messageId, state.session, new AbortController().signal)).rejects.toThrow();
  });
  it('does not reuse cached bytes after a denied HEAD permission check', async () => {
    state.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fetchCommunityAttachment(messageId, state.session, new AbortController().signal, true)).rejects.toThrow('access');
    expect(state.fetch.mock.calls[0][1].method).toBe('HEAD');
  });
});
