/**
 * useSpaceAudio — real LiveKit audio for VYBE Spaces.
 *
 * Connects to the `space-{id}` LiveKit room via the `spaces-token` edge
 * function. Speakers (host/co_host/speaker) publish their mic; listeners are
 * subscribe-only. Promotion to speaker reconnects with a publish-capable
 * token automatically (callers re-invoke connect when their role changes).
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

export type SpaceAudioState = 'idle' | 'connecting' | 'connected' | 'error';

interface SpaceTokenResponse {
  token: string;
  url: string;
  roomName: string;
  canPublish: boolean;
  role: string;
}

export function useSpaceAudio() {
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const connectedKeyRef = useRef<string | null>(null);
  const pendingRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const publishRef = useRef(false);
  const micIntentRef = useRef(false);
  const micChangeRef = useRef(0);
  const micPendingRef = useRef<Promise<unknown>>(Promise.resolve());

  const [state, setState] = useState<SpaceAudioState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [micEnabled, setMicEnabled] = useState(false);

  const detachAudio = useCallback((participantId: string) => {
    const el = audioElsRef.current.get(participantId);
    if (el) {
      try { el.pause(); el.srcObject = null; el.remove(); } catch { /* ignore */ }
      audioElsRef.current.delete(participantId);
    }
  }, []);

  const disconnect = useCallback(async () => {
    ++generationRef.current;
    ++micChangeRef.current;
    const room = roomRef.current;
    roomRef.current = null;
    connectedKeyRef.current = null;
    pendingRef.current = null;
    publishRef.current = false;
    micIntentRef.current = false;
    micPendingRef.current = Promise.resolve();
    audioElsRef.current.forEach((el) => {
      try { el.pause(); el.srcObject = null; el.remove(); } catch { /* ignore */ }
    });
    audioElsRef.current.clear();
    if (mountedRef.current) {
      setActiveSpeakerIds(new Set());
      setCanPublish(false);
      setMicEnabled(false);
      setError(null);
      setState('idle');
    }
    if (room) {
      try { await room.disconnect(); } catch { /* ignore */ }
    }
  }, []);

  /**
   * Connect (or reconnect after a role change). Safe to call repeatedly —
   * coalesces pending attempts and no-ops for the same connected room/role.
   */
  const connect = useCallback((spaceId: string, role: string): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve();
    const key = JSON.stringify([spaceId, role]);
    if (pendingRef.current?.key === key) return pendingRef.current.promise;
    if (roomRef.current && connectedKeyRef.current === key) return Promise.resolve();
    // Invalidate even token-only attempts before waiting for a previous room.
    const stopped = disconnect();
    const generation = generationRef.current;
    const current = () => mountedRef.current && generationRef.current === generation;
    setState('connecting');
    setError(null);
    const promise: Promise<void> = (async () => {
      try {
        await stopped;
        if (!current()) return;
        const { data, error: fnError } = await db.functions.invoke<SpaceTokenResponse>(
          'spaces-token',
          { body: { spaceId } },
        );
        if (!current()) return;
        if (fnError || !data?.token || !data.url) {
          throw new Error(fnError?.message || 'Could not get audio token');
        }

        const room = new Room({ adaptiveStream: true, dynacast: true });
        const activeRoom = room;
        roomRef.current = activeRoom;
        const active = () => current() && roomRef.current === activeRoom;

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (!active() || track.kind !== Track.Kind.Audio) return;
          detachAudio(participant.identity);
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.setAttribute('playsinline', 'true');
          document.body.appendChild(el);
          el.play().catch(() => { /* resumes on next user gesture */ });
          audioElsRef.current.set(participant.identity, el);
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (!active() || track.kind !== Track.Kind.Audio) return;
          try { track.detach().forEach((el) => el.remove()); } catch { /* ignore */ }
          detachAudio(participant.identity);
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (!active()) return;
          detachAudio(participant.identity);
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          if (!active()) return;
          setActiveSpeakerIds(new Set(speakers.map((s) => s.identity)));
        });

        room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
          if (!active()) return;
          if (cs === ConnectionState.Connected) setState('connected');
          else if (cs === ConnectionState.Reconnecting) setState('connecting');
          else if (cs === ConnectionState.Disconnected) void disconnect();
        });

        await room.connect(data.url, data.token);
        if (!active()) {
          await room.disconnect().catch(() => {});
          return;
        }
        connectedKeyRef.current = key;
        publishRef.current = data.canPublish === true;
        setCanPublish(publishRef.current);
        setState('connected');
      } catch (err: unknown) {
        if (!current()) return;
        // A failed handshake can already own tracks and transport resources.
        await disconnect();
        if (!mountedRef.current || generationRef.current !== generation + 1) return;
        const msg = err instanceof Error ? err.message : 'Audio connection failed';
        console.warn('[SpaceAudio] connect failed:', msg);
        setError(msg);
        setState('error');
      } finally {
        if (pendingRef.current?.promise === promise) pendingRef.current = null;
      }
    })();
    pendingRef.current = { key, promise };
    return promise;
  }, [detachAudio, disconnect]);

  /** Publish/unpublish the local mic (speakers only). */
  const setMic = useCallback(async (enabled: boolean): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || !publishRef.current) return false;
    const change = ++micChangeRef.current;
    micIntentRef.current = enabled;
    try {
      // Keep SDK operations ordered too: ignoring stale React updates alone
      // would let an older enable finish after the user's latest mute.
      const operation = micPendingRef.current.catch(() => {}).then(async () => {
        if (!mountedRef.current || roomRef.current !== room || micChangeRef.current !== change) return;
        await room.localParticipant.setMicrophoneEnabled(enabled);
        if (roomRef.current !== room) await room.disconnect().catch(() => {});
      });
      micPendingRef.current = operation;
      await operation;
      if (!mountedRef.current || roomRef.current !== room || micChangeRef.current !== change) return false;
      setMicEnabled(enabled);
      return true;
    } catch (err) {
      if (!mountedRef.current || roomRef.current !== room || micChangeRef.current !== change) return false;
      micIntentRef.current = false;
      console.warn('[SpaceAudio] mic toggle failed:', err);
      return false;
    }
  }, []);

  // Resume playback + mic after app background (iOS suspends media)
  useEffect(() => {
    const resume = () => {
      audioElsRef.current.forEach((el) => el.play().catch(() => { /* ignore */ }));
      const room = roomRef.current;
      if (room && publishRef.current && micIntentRef.current) {
        void setMic(true);
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') resume(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('app-resumed', resume);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('app-resumed', resume);
    };
  }, [setMic]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; void disconnect(); };
  }, [disconnect]);

  return { state, error, canPublish, micEnabled, activeSpeakerIds, connect, disconnect, setMic };
}
