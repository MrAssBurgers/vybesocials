/**
 * useCommunityVoice — Discord-style persistent voice for community channels.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteTrack,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client';
import { db } from '@/lib/firebase';
import { useCommunitySession } from './useCommunitySession';
import { communityAccountLease, communityAccountSubscribe, communityRequest, isCommunitySessionCurrent, type CommunityAccountSession } from '@/lib/communityService';
import { parseEdgeInvokeResult } from '@/lib/edgeFunctionResponse';
import type { VybeAuthError } from '@/lib/firebase/types';

export type CommunityVoiceState = 'idle' | 'connecting' | 'connected' | 'error';

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

interface VoiceTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

interface ActiveConnection {
  serverId: string;
  channelId: string;
  channelName: string;
}

/** Both names use the community {serverId, channelId} contract. */
const VOICE_TOKEN_FUNCTIONS = ['community-voice-token', 'spaces-token'] as const;

function isMissingVoiceFunction(error: VybeAuthError | null): boolean {
  if (!error || (error.code || error.name || '').replace(/^functions\//, '') !== 'not-found') return false;
  // A bare 404 cannot distinguish a missing deployment from a missing resource.
  // Require an explicit missing-function response before using the legacy alias.
  return /^function (?:community-voice-token |communityVoiceToken |spaces-token |spacesToken )?(?:not found|does not exist)(?: \[404\])?\.?$/i.test(error.message.trim());
}

async function fetchCommunityVoiceToken(
  serverId: string,
  channelId: string,
  guard: () => void,
): Promise<VoiceTokenResponse> {
  const body = { serverId, channelId };
  let lastError = 'Could not join voice channel';

  for (const fnName of VOICE_TOKEN_FUNCTIONS) {
    guard();
    const result = await db.functions.invoke<VoiceTokenResponse>(fnName, { body });
    guard();
    const { payload, errorCode, errorMessage } = await parseEdgeInvokeResult(result);
    guard();
    const typed = payload as unknown as VoiceTokenResponse | undefined;

    if (!result.error && !errorCode && typeof typed?.token === 'string' && typed.token.trim()
      && typeof typed.url === 'string' && typed.url.trim()) {
      return typed;
    }

    const msg = errorMessage || errorCode || lastError;
    if (payload == null && isMissingVoiceFunction(result.error)) {
      lastError = 'Community voice is not available yet. Please try again later.';
      continue;
    }

    throw new Error(msg);
  }

  throw new Error(lastError);
}

function participantMuted(p: Participant): boolean {
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  return !micPub || micPub.isMuted || !micPub.track;
}

function collectParticipants(
  room: Room,
  activeSpeakerIds: Set<string>,
): VoiceParticipant[] {
  const list: VoiceParticipant[] = [];
  const local = room.localParticipant;

  list.push({
    identity: local.identity,
    name: local.name || 'You',
    isLocal: true,
    isSpeaking: activeSpeakerIds.has(local.identity),
    isMuted: participantMuted(local),
  });

  room.remoteParticipants.forEach((p: RemoteParticipant) => {
    list.push({
      identity: p.identity,
      name: p.name || 'Member',
      isLocal: false,
      isSpeaking: activeSpeakerIds.has(p.identity),
      isMuted: participantMuted(p),
    });
  });

  return list;
}

interface VoiceAttempt {
  id: number;
  session: CommunityAccountSession;
  guard: () => void;
  connection: ActiveConnection;
  room: Room | null;
  stopWatching?: () => void;
  checking?: Promise<boolean>;
  joined?: boolean;
}
const CHECK_INTERVAL = 15_000;
const CHECK_TIMEOUT = 10_000;

export function useCommunityVoice() {
  const { session, uid, ready } = useCommunitySession();
  const attemptRef = useRef<VoiceAttempt | null>(null);
  const serial = useRef(0);
  const micRevision = useRef(0);
  const mounted = useRef(true);
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const deafenedRef = useRef(false);
  const speakersRef = useRef(new Set<string>());
  const [state, setState] = useState<CommunityVoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ActiveConnection | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafenedState] = useState(false);

  const current = useCallback((attempt: VoiceAttempt) => mounted.current && attemptRef.current === attempt && isCommunitySessionCurrent(attempt.session), []);
  const detachAudio = useCallback((participantId: string) => {
    const el = audioElsRef.current.get(participantId);
    if (el) { el.pause(); el.srcObject = null; el.remove(); audioElsRef.current.delete(participantId); }
  }, []);
  const disconnect = useCallback(async () => {
    serial.current++;
    micRevision.current++;
    const old = attemptRef.current;
    attemptRef.current = null;
    old?.stopWatching?.();
    old?.room?.removeAllListeners();
    audioElsRef.current.forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
    audioElsRef.current.clear();
    deafenedRef.current = false;
    speakersRef.current = new Set();
    if (mounted.current) {
      setActiveSpeakerIds(speakersRef.current); setParticipants([]); setMicEnabled(false);
      setDeafenedState(false); setConnection(null); setState('idle'); setError(null);
    }
    if (old?.room) { try { await old.room.disconnect(); } catch { /* Already detached locally. */ } }
  }, []);
  const fail = useCallback(async (attempt: VoiceAttempt, message: string) => {
    if (!current(attempt)) return;
    // Teardown is synchronous before disconnect's network work completes.
    const stopped = disconnect();
    if (mounted.current) { setError(message); setState('error'); }
    await stopped;
  }, [current, disconnect]);
  const refresh = useCallback((attempt: VoiceAttempt) => {
    if (current(attempt) && attempt.room) setParticipants(collectParticipants(attempt.room, speakersRef.current));
  }, [current]);
  const checkAccess = useCallback((attempt: VoiceAttempt): Promise<boolean> => {
    if (!current(attempt)) return Promise.resolve(false);
    if (attempt.checking) return attempt.checking;
    attempt.checking = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          communityRequest<{ permissions: { can_view: boolean; can_send: boolean } }>('community-manage', { action: 'permissions', channelId: attempt.connection.channelId }, attempt.guard),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Voice access could not be confirmed. Join again when you are online.')), CHECK_TIMEOUT); }),
        ]);
        if (!current(attempt)) return false;
        if (response.permissions?.can_view !== true) throw new Error('You no longer have access to this voice channel.');
        if (response.permissions.can_send !== true && attempt.room) {
          micRevision.current++;
          await attempt.room.localParticipant.setMicrophoneEnabled(false);
          if (!current(attempt)) return false;
          setMicEnabled(false); refresh(attempt);
        }
        return response.permissions.can_send === true;
      } catch (reason) {
        await fail(attempt, reason instanceof Error ? reason.message : 'Voice access could not be confirmed. Join again.');
        return false;
      } finally { if (timeout) clearTimeout(timeout); attempt.checking = undefined; }
    })();
    return attempt.checking;
  }, [current, fail, refresh]);

  const connect = useCallback(async (serverId: string, channelId: string, channelName: string) => {
    if (!ready) return;
    const lease = communityAccountLease(uid, session);
    try { lease(); } catch { return; }
    const existing = attemptRef.current;
    if (existing && current(existing) && existing.connection.serverId === serverId && existing.connection.channelId === channelId) return;
    // Never wait for an old network disconnect before capturing the new attempt.
    void disconnect();
    const id = ++serial.current;
    const attempt: VoiceAttempt = { id, session, connection: { serverId, channelId, channelName }, room: null,
      guard: () => { lease(); if (!current(attempt)) throw new Error('Voice connection changed.'); } };
    attemptRef.current = attempt;
    setState('connecting'); setError(null);
    try {
      const data = await fetchCommunityVoiceToken(serverId, channelId, attempt.guard);
      attempt.guard();
      const room = new Room({ adaptiveStream: true, dynacast: true });
      attempt.room = room; // A pending room.connect must be cancellable too.
      const update = () => refresh(attempt);
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (!current(attempt) || track.kind !== Track.Kind.Audio) return;
        detachAudio(participant.identity);
        const el = track.attach() as HTMLAudioElement;
        el.autoplay = true; el.setAttribute('playsinline', 'true'); el.muted = deafenedRef.current;
        document.body.appendChild(el); audioElsRef.current.set(participant.identity, el);
        void el.play().catch(() => {});
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (!current(attempt) || track.kind !== Track.Kind.Audio) return;
        track.detach().forEach(el => el.remove()); detachAudio(participant.identity);
      });
      room.on(RoomEvent.ParticipantConnected, update);
      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => { if (current(attempt)) { detachAudio(participant.identity); update(); } });
      for (const event of [RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished]) room.on(event, update);
      room.on(RoomEvent.ActiveSpeakersChanged, (active: Participant[]) => {
        if (!current(attempt)) return;
        speakersRef.current = new Set(active.map(s => s.identity)); setActiveSpeakerIds(speakersRef.current); update();
      });
      room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
        if (!current(attempt)) return;
        if (cs === ConnectionState.Reconnecting) setState('connecting');
        else if (cs === ConnectionState.Connected && attempt.joined) {
          void checkAccess(attempt).then(() => { if (current(attempt)) setState('connected'); });
        }
        else if (cs === ConnectionState.Disconnected) void fail(attempt, 'Voice disconnected. Join again to continue.');
      });
      await room.connect(data.url, data.token);
      if (!current(attempt)) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(false);
      attempt.guard();
      await checkAccess(attempt);
      attempt.guard();
      attempt.joined = true;
      setMicEnabled(false); setConnection(attempt.connection); setState('connected'); update();
      const timer = setInterval(() => { void checkAccess(attempt); }, CHECK_INTERVAL);
      attempt.stopWatching = () => clearInterval(timer);
    } catch (reason) {
      if (current(attempt)) await fail(attempt, reason instanceof Error ? reason.message : 'Voice connection failed');
    }
  }, [ready, uid, session, current, disconnect, detachAudio, refresh, checkAccess, fail]);

  const setMic = useCallback(async (enabled: boolean): Promise<boolean> => {
    const revision = ++micRevision.current;
    const attempt = attemptRef.current;
    if (!attempt?.room || attempt.session !== session || !current(attempt) || deafenedRef.current) return false;
    try {
      if (enabled && !await checkAccess(attempt)) return false;
      if (!current(attempt) || revision !== micRevision.current || deafenedRef.current) return false;
      await attempt.room.localParticipant.setMicrophoneEnabled(enabled);
      if (!current(attempt) || revision !== micRevision.current || deafenedRef.current) { await attempt.room.localParticipant.setMicrophoneEnabled(false); return false; }
      setMicEnabled(enabled); refresh(attempt); return true;
    } catch { return false; }
  }, [current, checkAccess, refresh, session]);
  const setDeafened = useCallback(async (enabled: boolean): Promise<boolean> => {
    const attempt = attemptRef.current;
    if (!attempt?.room || attempt.session !== session || !current(attempt)) return false;
    deafenedRef.current = enabled; setDeafenedState(enabled);
    audioElsRef.current.forEach(el => { el.muted = enabled; });
    if (enabled) {
      micRevision.current++;
      try { await attempt.room.localParticipant.setMicrophoneEnabled(false); } catch { /* Room may already be closing. */ }
      if (!current(attempt)) return false;
      setMicEnabled(false);
    }
    refresh(attempt); return true;
  }, [current, refresh, session]);
  const toggleMic = useCallback(async () => {
    if (deafenedRef.current) { await setDeafened(false); return setMic(true); }
    return setMic(!micEnabled);
  }, [micEnabled, setDeafened, setMic]);

  useEffect(() => {
    const changed = () => { const attempt = attemptRef.current; if (attempt && !isCommunitySessionCurrent(attempt.session)) void disconnect(); };
    return communityAccountSubscribe(changed);
  }, [disconnect]);
  useEffect(() => { if (!ready) void disconnect(); }, [ready, disconnect]);
  useEffect(() => {
    const resume = async () => {
      const attempt = attemptRef.current;
      if (!attempt || !current(attempt)) return;
      await checkAccess(attempt);
      if (!current(attempt) || deafenedRef.current) return;
      audioElsRef.current.forEach(el => { void el.play().catch(() => {}); });
    };
    const visible = () => { if (document.visibilityState === 'visible') void resume(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('app-resumed', resume);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('app-resumed', resume); };
  }, [current, checkAccess]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void disconnect(); };
  }, [disconnect]);
  return { state, error, connection, participants, activeSpeakerIds, micEnabled, deafened,
    isConnected: state === 'connected' && !!connection && ready, connect, disconnect, setMic, setDeafened, toggleMic };
}
