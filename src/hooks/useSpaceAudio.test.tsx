import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rooms: [] as any[], roomConnect: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mocks.invoke } } }));
vi.mock('livekit-client', () => ({
  Room: class {
    handlers = new Map<string, (...args: any[]) => void>();
    connect = mocks.roomConnect;
    disconnect = vi.fn(async () => {});
    localParticipant = { setMicrophoneEnabled: vi.fn(async () => {}) };
    constructor() { mocks.rooms.push(this); }
    on(event: string, handler: (...args: any[]) => void) { this.handlers.set(event, handler); return this; }
  },
  RoomEvent: { TrackSubscribed: 'track', TrackUnsubscribed: 'untrack', ParticipantDisconnected: 'left', ActiveSpeakersChanged: 'speakers', ConnectionStateChanged: 'state' },
  Track: { Kind: { Audio: 'audio' } },
  ConnectionState: { Connected: 'connected', Reconnecting: 'reconnecting', Disconnected: 'disconnected' },
}));
import { useSpaceAudio } from './useSpaceAudio';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const token = { data: { token: 'test-token', url: 'wss://audio.test', roomName: 'space-one', canPublish: false, role: 'listener' }, error: null };
beforeEach(() => { vi.clearAllMocks(); mocks.rooms.length = 0; mocks.invoke.mockResolvedValue(token); mocks.roomConnect.mockResolvedValue(undefined); });

it('leaving during token loading prevents a late room join', async () => {
  const request = deferred<typeof token>(); mocks.invoke.mockReturnValue(request.promise);
  const { result } = renderHook(() => useSpaceAudio());
  let joining!: Promise<void>;
  act(() => { joining = result.current.connect('one', 'listener'); });
  await act(async () => { await result.current.disconnect(); request.resolve(token); await joining; });
  expect(mocks.rooms).toHaveLength(0);
  expect(result.current.state).toBe('idle');
});

it('coalesces duplicate pending connections for the same room and role', async () => {
  const request = deferred<typeof token>(); mocks.invoke.mockReturnValue(request.promise);
  const { result } = renderHook(() => useSpaceAudio());
  let first!: Promise<void>; let second!: Promise<void>;
  await act(async () => { first = result.current.connect('one', 'listener'); second = result.current.connect('one', 'listener'); await Promise.resolve(); });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  await act(async () => { request.resolve(token); await Promise.all([first, second]); });
  expect(mocks.rooms).toHaveLength(1);
});

it('connects to a different room even when the role is unchanged', async () => {
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'listener'); });
  await act(async () => { await result.current.connect('two', 'listener'); });
  expect(mocks.invoke.mock.calls.map(call => call[1].body.spaceId)).toEqual(['one', 'two']);
  expect(mocks.rooms[0].disconnect).toHaveBeenCalled();
});

it('disconnects an in-flight room and ignores its late success', async () => {
  const transport = deferred<void>(); mocks.roomConnect.mockReturnValue(transport.promise);
  const { result } = renderHook(() => useSpaceAudio());
  let joining!: Promise<void>;
  await act(async () => { joining = result.current.connect('one', 'listener'); await Promise.resolve(); });
  const room = mocks.rooms[0];
  await act(async () => { await result.current.disconnect(); transport.resolve(); await joining; });
  expect(room.disconnect).toHaveBeenCalled();
  expect(result.current.state).toBe('idle');
});

it('ignores retired-room events and cannot attach retired audio', async () => {
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'listener'); });
  const room = mocks.rooms[0];
  await act(async () => { await result.current.disconnect(); });
  const attach = vi.fn(() => { const el = document.createElement('audio'); el.play = vi.fn(async () => {}); return el; });
  act(() => {
    room.handlers.get('state')('connected');
    room.handlers.get('speakers')([{ identity: 'retired' }]);
    room.handlers.get('track')({ kind: 'audio', attach }, null, { identity: 'retired' });
  });
  expect(attach).not.toHaveBeenCalled();
  expect(result.current.state).toBe('idle');
  expect(result.current.activeSpeakerIds.size).toBe(0);
});

it('unmounting cancels a pending token response', async () => {
  const request = deferred<typeof token>(); mocks.invoke.mockReturnValue(request.promise);
  const { result, unmount } = renderHook(() => useSpaceAudio());
  let joining!: Promise<void>;
  act(() => { joining = result.current.connect('one', 'listener'); });
  unmount();
  await act(async () => { request.resolve(token); await joining; });
  expect(mocks.rooms).toHaveLength(0);
});

it('a superseded failed token cannot overwrite the current room', async () => {
  const request = deferred<typeof token>(); mocks.invoke.mockReturnValueOnce(request.promise).mockResolvedValue(token);
  const { result } = renderHook(() => useSpaceAudio());
  let joining!: Promise<void>;
  await act(async () => { joining = result.current.connect('one', 'speaker'); await Promise.resolve(); });
  await act(async () => { await result.current.connect('two', 'listener'); });
  await act(async () => { request.resolve({ data: null as any, error: { message: 'Old request failed' } as any }); await joining; });
  expect(result.current.state).toBe('connected');
  expect(result.current.error).toBeNull();
  expect(result.current.canPublish).toBe(false);
});

it('a failed transport is closed and can be retried', async () => {
  mocks.roomConnect.mockRejectedValueOnce(new Error('Network unavailable'));
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'listener'); });
  expect(mocks.rooms[0].disconnect).toHaveBeenCalled();
  expect(result.current.state).toBe('error');
  await act(async () => { await result.current.connect('one', 'listener'); });
  expect(mocks.rooms).toHaveLength(2);
  expect(result.current.state).toBe('connected');
});

it('a late microphone toggle cannot affect the replacement listener room', async () => {
  mocks.invoke.mockResolvedValueOnce({ ...token, data: { ...token.data, canPublish: true, role: 'speaker' } });
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'speaker'); });
  const toggle = deferred<void>(); mocks.rooms[0].localParticipant.setMicrophoneEnabled.mockReturnValue(toggle.promise);
  let enabling!: Promise<boolean>;
  act(() => { enabling = result.current.setMic(true); });
  await act(async () => { await result.current.connect('two', 'listener'); toggle.resolve(); expect(await enabling).toBe(false); });
  expect(result.current.micEnabled).toBe(false);
  expect(result.current.canPublish).toBe(false);
  act(() => { window.dispatchEvent(new Event('app-resumed')); });
  expect(mocks.rooms[1].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
});

it('a terminal disconnection releases audio and permits joining again', async () => {
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'listener'); });
  await act(async () => { mocks.rooms[0].handlers.get('state')('disconnected'); });
  expect(result.current.state).toBe('idle');
  await act(async () => { await result.current.connect('one', 'listener'); });
  expect(mocks.rooms).toHaveLength(2);
});

it('orders an in-flight mic enable before the latest mute', async () => {
  mocks.invoke.mockResolvedValue({ ...token, data: { ...token.data, canPublish: true, role: 'speaker' } });
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'speaker'); });
  const toggle = deferred<void>();
  const sdk = mocks.rooms[0].localParticipant.setMicrophoneEnabled;
  sdk.mockReturnValueOnce(toggle.promise).mockResolvedValue(undefined);
  let enabling!: Promise<boolean>; let muting!: Promise<boolean>;
  await act(async () => { enabling = result.current.setMic(true); await Promise.resolve(); await Promise.resolve(); });
  act(() => { muting = result.current.setMic(false); });
  expect(sdk.mock.calls.map(call => call[0])).toEqual([true]);
  await act(async () => { toggle.resolve(); await Promise.all([enabling, muting]); });
  expect(sdk.mock.calls.map(call => call[0])).toEqual([true, false]);
  expect(result.current.micEnabled).toBe(false);
});

it('listener tokens never enable the microphone, including after resume', async () => {
  const { result } = renderHook(() => useSpaceAudio());
  await act(async () => { await result.current.connect('one', 'speaker'); });
  await act(async () => { expect(await result.current.setMic(true)).toBe(false); window.dispatchEvent(new Event('app-resumed')); });
  expect(mocks.rooms[0].localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
});
