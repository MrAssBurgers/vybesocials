import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommunityVoice } from './useCommunityVoice';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), mic: vi.fn(), rooms: 0 }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mocks.invoke } } }));
vi.mock('livekit-client', () => ({
  Room: class {
    constructor() { mocks.rooms++; }
    remoteParticipants = new Map();
    localParticipant = { identity: 'viewer-profile', name: 'You', getTrackPublication: () => undefined, setMicrophoneEnabled: mocks.mic };
    on() { return this; }
    connect = mocks.connect;
    disconnect = mocks.disconnect;
  },
  RoomEvent: {},
  Track: { Source: { Microphone: 'microphone' }, Kind: { Audio: 'audio' } },
  ConnectionState: { Connected: 'connected', Reconnecting: 'reconnecting', Disconnected: 'disconnected' },
}));

const voiceToken = { token: 'test-community-token', url: 'wss://voice.example.invalid', roomName: 'comm_v2_server-derived-hash' };
const join = async (hook: ReturnType<typeof renderHook<ReturnType<typeof useCommunityVoice>, unknown>>) => {
  await act(async () => hook.result.current.connect('community-server', 'voice-channel', 'Game night'));
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.rooms = 0;
  mocks.invoke.mockResolvedValue({ data: voiceToken, error: null });
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
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('community-voice-token', { body: { serverId: 'community-server', channelId: 'voice-channel' } });
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
    expect(mocks.invoke.mock.calls).toEqual([
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
