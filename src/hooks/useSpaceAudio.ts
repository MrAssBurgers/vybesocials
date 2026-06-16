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
  const connectedRoleRef = useRef<string | null>(null);

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
    const room = roomRef.current;
    roomRef.current = null;
    connectedRoleRef.current = null;
    audioElsRef.current.forEach((el) => {
      try { el.pause(); el.srcObject = null; el.remove(); } catch { /* ignore */ }
    });
    audioElsRef.current.clear();
    setActiveSpeakerIds(new Set());
    setCanPublish(false);
    setMicEnabled(false);
    setState('idle');
    if (room) {
      try { await room.disconnect(); } catch { /* ignore */ }
    }
  }, []);

  /**
   * Connect (or reconnect after a role change). Safe to call repeatedly —
   * no-ops when already connected with the same role.
   */
  const connect = useCallback(async (spaceId: string, role: string) => {
    if (roomRef.current && connectedRoleRef.current === role) return;

    // Role changed (e.g. promoted to speaker) — tear down and rejoin
    if (roomRef.current) {
      await disconnect();
    }

    setState('connecting');
    setError(null);

    try {
      const { data, error: fnError } = await db.functions.invoke<SpaceTokenResponse>(
        'spaces-token',
        { body: { spaceId } },
      );
      if (fnError || !data?.token) {
        throw new Error(fnError?.message || 'Could not get audio token');
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        detachAudio(participant.identity);
        const el = track.attach() as HTMLAudioElement;
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        document.body.appendChild(el);
        el.play().catch(() => { /* resumes on next user gesture */ });
        audioElsRef.current.set(participant.identity, el);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        try { track.detach().forEach((el) => el.remove()); } catch { /* ignore */ }
        detachAudio(participant.identity);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        detachAudio(participant.identity);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setActiveSpeakerIds(new Set(speakers.map((s) => s.identity)));
      });

      room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
        if (cs === ConnectionState.Connected) setState('connected');
        else if (cs === ConnectionState.Reconnecting) setState('connecting');
        else if (cs === ConnectionState.Disconnected && roomRef.current === room) setState('idle');
      });

      await room.connect(data.url, data.token);

      roomRef.current = room;
      connectedRoleRef.current = role;
      setCanPublish(data.canPublish);
      setState('connected');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Audio connection failed';
      console.warn('[SpaceAudio] connect failed:', msg);
      setError(msg);
      setState('error');
    }
  }, [detachAudio, disconnect]);

  /** Publish/unpublish the local mic (speakers only). */
  const setMic = useCallback(async (enabled: boolean): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || !canPublish) return false;
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicEnabled(enabled);
      return true;
    } catch (err) {
      console.warn('[SpaceAudio] mic toggle failed:', err);
      return false;
    }
  }, [canPublish]);

  // Resume playback + mic after app background (iOS suspends media)
  useEffect(() => {
    const resume = () => {
      audioElsRef.current.forEach((el) => el.play().catch(() => { /* ignore */ }));
      const room = roomRef.current;
      if (room && micEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch(() => { /* ignore */ });
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') resume(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('app-resumed', resume);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('app-resumed', resume);
    };
  }, [micEnabled]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return { state, error, canPublish, micEnabled, activeSpeakerIds, connect, disconnect, setMic };
}
