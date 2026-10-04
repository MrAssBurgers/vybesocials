import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommunityVoice } from './useCommunityVoice';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), mic: vi.fn(), rooms: 0, uid: 'alice' as string | null, listener: null as null | ((user: { uid: string } | null) => void), events: new Map<string, (...args: unknown[]) => void>() }));
const auth = vi.hoisted(() => ({ get currentUser() { return mocks.uid ? { uid: mocks.uid } : null; }, onAuthStateChanged: (listener: typeof mocks.listener) => { mocks.listener = listener; return () => {}; } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mocks.uid ? { id: mocks.uid } : null }) }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mocks.invoke } }, getFirebaseAuth: () => auth }));
vi.mock('livekit-client', () => ({
  Room: class {
    constructor() { mocks.rooms++; }
    remoteParticipants = new Map();
    localParticipant = { identity: 'viewer-profile', name: 'You', getTrackPublication: () => undefined, setMicrophoneEnabled: mocks.mic };
    on(event: string, callback: (...args: unknown[]) => void) { mocks.events.set(event, callback); return this; }
    removeAllListeners() { mocks.events.clear(); }
    connect = mocks.connect;
    disconnect = mocks.disconnect;
  },
  RoomEvent: { TrackSubscribed: 'track', ActiveSpeakersChanged: 'speakers', ConnectionStateChanged: 'connection' },
  Track: { Source: { Microphone: 'microphone' }, Kind: { Audio: 'audio' } },
  ConnectionState: { Connected: 'connected', Reconnecting: 'reconnecting', Disconnected: 'disconnected' },
}));

const voiceToken = { token: 'test-community-token', url: 'wss://voice.example.invalid', roomName: 'comm_v2_server-derived-hash' };
const join = async (hook: ReturnType<typeof renderHook<ReturnType<typeof useCommunityVoice>, unknown>>) => {
  await act(async () => hook.result.current.connect('community-server', 'voice-channel', 'Game night'));
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.rooms = 0; mocks.uid = 'alice'; mocks.events.clear();
  mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'community-manage' ? { permissions: { can_view: true, can_send: true } } : voiceToken, error: null }));
  mocks.connect.mockResolvedValue(undefined);
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.mic.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('community voice callable routing', () => {
  it('joins the selected group voice channel using the canonical community request', async () => {
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'community-voice-token', { body: { serverId: 'community-server', channelId: 'voice-channel' } });
    expect(mocks.connect).toHaveBeenCalledWith(voiceToken.url, voiceToken.token);
    expect(mocks.mic).toHaveBeenCalledWith(false);
    expect(hook.result.current.connection).toEqual({ serverId: 'community-server', channelId: 'voice-channel', channelName: 'Game night' });
    expect(hook.result.current.isConnected).toBe(true);
  });

  it.each([
    { name: 'not-found', message: 'Function community-voice-token not found [404]' },
    { code: 'functions/not-found', message: 'Function communityVoiceToken does not exist' },
  ])('falls back to the compatible spaces alias only for a missing function: %j', async error => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke.mock.calls.slice(0, 2)).toEqual([
      ['community-voice-token', { body: { serverId: 'community-server', channelId: 'voice-channel' } }],
      ['spaces-token', { body: { serverId: 'community-server', channelId: 'voice-channel' } }],
    ]);
    expect(hook.result.current.isConnected).toBe(true);
  });

  it.each([
    { name: 'permission-denied', message: 'Not a member of this community' },
    { name: 'unauthenticated', message: 'Sign in required' },
    { name: 'failed-precondition', message: 'LIVEKIT not configured' },
    { name: 'invalid-argument', message: 'conversationId required' },
    { name: 'resource-exhausted', message: 'Try again later' },
    { name: 'not-found', message: 'Channel not found [404]' },
    { name: 'not-found', message: 'Community not found' },
    { name: 'not-found', message: 'not-found [404]' },
    { name: 'not-found', message: 'Not Found' },
    { name: 'internal', message: 'Failed to fetch' },
    { message: 'Failed to send a request' },
    { message: 'Function communityVoiceToken not found' },
  ])('does not fall through on authorization, domain, configuration, or network failure: %j', async error => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.rooms).toBe(0);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('error');
    expect(hook.result.current.error).toBe(error.message);
  });

  it('does not retry a domain not-found payload as a missing deployment', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { error: 'not-found' }, error: null });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toBe('error');
    expect(mocks.rooms).toBe(0);
  });

  it('never accepts a token alongside an authorization error', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: voiceToken, error: { name: 'permission-denied', message: 'Not allowed' } });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.rooms).toBe(0);
    expect(hook.result.current.error).toBe('Not allowed');
  });

  it('stops after the compatible alias also reports missing', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'not-found', message: 'Function not found [404]' } });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke.mock.calls.map(call => call[0])).toEqual(['community-voice-token', 'spaces-token']);
    expect(hook.result.current.error).toBe('Community voice is not available yet. Please try again later.');
    expect(hook.result.current.state).toBe('error');
  });

  it('does not route a compatible-alias permission failure to the DM endpoint', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'not-found', message: 'Function communityVoiceToken not found [404]' } });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'permission-denied', message: 'Not allowed' } });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke.mock.calls.map(call => call[0])).toEqual(['community-voice-token', 'spaces-token']);
    expect(mocks.rooms).toBe(0);
    expect(hook.result.current.error).toBe('Not allowed');
  });

  it('reports a malformed successful response without trying another endpoint', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { token: '', url: voiceToken.url }, error: null });
    const hook = renderHook(useCommunityVoice);
    await join(hook);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('error');
  });
});

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
describe('community voice account and connection lifetime', () => {
  it('cannot reconnect when Disconnect is chosen while the token is pending', async () => {
    const token = deferred<unknown>(); mocks.invoke.mockReturnValueOnce(token.promise);
    const hook = renderHook(useCommunityVoice); let pending!: Promise<void>;
    act(() => { pending = hook.result.current.connect('server', 'voice', 'Voice'); });
    await act(async () => { await hook.result.current.disconnect(); token.resolve({ data: voiceToken, error: null }); await pending; });
    expect(mocks.rooms).toBe(0); expect(hook.result.current.state).toBe('idle');
  });
  it('disconnects a pending Room.connect and refuses its late completion', async () => {
    const connection = deferred<void>(); mocks.connect.mockReturnValueOnce(connection.promise);
    const hook = renderHook(useCommunityVoice); let pending!: Promise<void>;
    act(() => { pending = hook.result.current.connect('server', 'voice', 'Voice'); });
    await waitFor(() => expect(mocks.rooms).toBe(1));
    await act(async () => { await hook.result.current.disconnect(); });
    expect(mocks.disconnect).toHaveBeenCalled();
    await act(async () => { connection.resolve(); await pending; });
    expect(hook.result.current.connection).toBeNull(); expect(hook.result.current.state).toBe('idle');
  });
  it('rejects a token from the previous Alice session after Alice to Bob to Alice', async () => {
    const token = deferred<unknown>(); mocks.invoke.mockReturnValueOnce(token.promise);
    const hook = renderHook(useCommunityVoice); let pending!: Promise<void>;
    act(() => { pending = hook.result.current.connect('server', 'voice', 'Voice'); });
    act(() => { mocks.uid='bob'; mocks.listener?.({uid:'bob'}); mocks.uid='alice'; mocks.listener?.({uid:'alice'}); });
    await act(async () => { token.resolve({data:voiceToken,error:null}); await pending; });
    expect(mocks.rooms).toBe(0); expect(hook.result.current.connection).toBeNull();
  });
  it('tears down connected audio on sign out and ignores captured old room events', async () => {
    const hook = renderHook(useCommunityVoice); await join(hook);
    const oldEvent = mocks.events.get('track')!; const attach=vi.fn();
    act(() => { mocks.uid=null; mocks.listener?.(null); });
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalled());
    act(() => { oldEvent({kind:'audio',attach}, null, {identity:'private-speaker'}); });
    expect(attach).not.toHaveBeenCalled(); expect(hook.result.current.participants).toEqual([]);
  });
  it('refuses late join after unmount', async () => {
    const token = deferred<unknown>(); mocks.invoke.mockReturnValueOnce(token.promise);
    const hook=renderHook(useCommunityVoice); let pending!:Promise<void>;
    act(()=>{pending=hook.result.current.connect('server','voice','Voice');}); hook.unmount();
    await act(async()=>{token.resolve({data:voiceToken,error:null});await pending;}); expect(mocks.rooms).toBe(0);
  });
  it('disconnects on a failed permission recheck before enabling the microphone', async () => {
    const hook=renderHook(useCommunityVoice);await join(hook);mocks.mic.mockClear();
    mocks.invoke.mockResolvedValueOnce({data:null,error:{code:'permission-denied',message:'Access removed'}});
    await act(async()=>{expect(await hook.result.current.setMic(true)).toBe(false);});
    expect(mocks.mic).not.toHaveBeenCalledWith(true);expect(hook.result.current.state).toBe('error');expect(hook.result.current.connection).toBeNull();
  });
  it('rechecks access on resume and never resumes audio after revocation', async()=>{
    const hook=renderHook(useCommunityVoice);await join(hook);
    mocks.invoke.mockResolvedValueOnce({data:null,error:{code:'permission-denied',message:'Access removed'}});
    act(()=>{window.dispatchEvent(new Event('app-resumed'));});
    await waitFor(()=>expect(hook.result.current.state).toBe('error'));expect(mocks.disconnect).toHaveBeenCalled();
  });
  it('polls current authority and stops after revocation',async()=>{
    vi.useFakeTimers();try{const hook=renderHook(useCommunityVoice);await join(hook);
      mocks.invoke.mockResolvedValueOnce({data:null,error:{code:'permission-denied',message:'Access removed'}});
      await act(async()=>{await vi.advanceTimersByTimeAsync(15_000);});expect(hook.result.current.state).toBe('error');
      const calls=mocks.invoke.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});expect(mocks.invoke).toHaveBeenCalledTimes(calls);
    }finally{vi.useRealTimers();}
  });
  it('does not unmute after a newer Mute request while authority is being checked', async () => {
    const hook = renderHook(useCommunityVoice); await join(hook); mocks.mic.mockClear();
    const permissions = deferred<unknown>(); mocks.invoke.mockReturnValueOnce(permissions.promise);
    let enable!: Promise<boolean>; act(() => { enable = hook.result.current.setMic(true); });
    await act(async () => { await hook.result.current.setMic(false); });
    await act(async () => { permissions.resolve({ data: { permissions: { can_view: true, can_send: true } }, error: null }); expect(await enable).toBe(false); });
    expect(mocks.mic).not.toHaveBeenCalledWith(true); expect(hook.result.current.micEnabled).toBe(false);
  });
  it('revalidates a reconnect instead of leaving the UI stuck connecting', async () => {
    const hook = renderHook(useCommunityVoice); await join(hook);
    act(() => { mocks.events.get('connection')?.('reconnecting'); }); expect(hook.result.current.state).toBe('connecting');
    await act(async () => { mocks.events.get('connection')?.('connected'); }); expect(hook.result.current.state).toBe('connected');
  });
  it('times out a stalled authority check and tears down the local voice room', async () => {
    vi.useFakeTimers(); try {
      const hook = renderHook(useCommunityVoice); await join(hook); mocks.invoke.mockReturnValueOnce(new Promise(() => {}));
      act(() => { window.dispatchEvent(new Event('app-resumed')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(hook.result.current.state).toBe('error'); expect(hook.result.current.connection).toBeNull(); expect(mocks.disconnect).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('does not let a stale Connect callback cancel the new account room', async () => {
    const hook = renderHook(useCommunityVoice); const oldConnect = hook.result.current.connect;
    act(() => { mocks.uid = 'bob'; mocks.listener?.({ uid: 'bob' }); });
    await join(hook); const calls = mocks.disconnect.mock.calls.length;
    await act(async () => { await oldConnect('old-server', 'old-room', 'Old'); });
    expect(mocks.disconnect).toHaveBeenCalledTimes(calls); expect(hook.result.current.isConnected).toBe(true);
  });

  it('invalidates an older microphone enable when a later authority poll removes speaking permission', async () => {
    vi.useFakeTimers(); try {
      const hook = renderHook(useCommunityVoice); await join(hook);
      const enabled = deferred<void>(); mocks.mic.mockImplementation((value: boolean) => value ? enabled.promise : Promise.resolve());
      let pending!: Promise<boolean>; act(() => { pending = hook.result.current.setMic(true); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(mocks.mic).toHaveBeenCalledWith(true);
      mocks.invoke.mockResolvedValueOnce({ data: { permissions: { can_view: true, can_send: false } }, error: null });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      await act(async () => { enabled.resolve(); expect(await pending).toBe(false); });
      expect(hook.result.current.micEnabled).toBe(false); expect(mocks.mic).toHaveBeenLastCalledWith(false);
      expect(hook.result.current.isConnected).toBe(true);
    } finally { vi.useRealTimers(); }
  });

});
