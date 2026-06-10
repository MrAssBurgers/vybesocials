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
import { supabase } from '@/integrations/supabase/client';

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

export function useCommunityVoice() {
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  const connectionRef = useRef<ActiveConnection | null>(null);
  const deafenedRef = useRef(false);

  const [state, setState] = useState<CommunityVoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ActiveConnection | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<Set<string>>(new Set());
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafenedState] = useState(false);

  const syncParticipants = useCallback((room: Room, speakers: Set<string>) => {
    setParticipants(collectParticipants(room, speakers));
  }, []);

  const detachAudio = useCallback((participantId: string) => {
    const el = audioElsRef.current.get(participantId);
    if (el) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
      audioElsRef.current.delete(participantId);
    }
  }, []);

  const setAllAudioVolume = useCallback((muted: boolean) => {
    audioElsRef.current.forEach((el) => {
      el.muted = muted;
    });
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    connectionRef.current = null;
    deafenedRef.current = false;

    audioElsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
    });
    audioElsRef.current.clear();

    setActiveSpeakerIds(new Set());
    setParticipants([]);
    setMicEnabled(false);
    setDeafenedState(false);
    setConnection(null);
    setState('idle');

    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const connect = useCallback(
    async (serverId: string, channelId: string, channelName: string) => {
      const current = connectionRef.current;
      if (
        roomRef.current &&
        current?.serverId === serverId &&
        current?.channelId === channelId
      ) {
        return;
      }

      if (roomRef.current) {
        await disconnect();
      }

      setState('connecting');
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke<VoiceTokenResponse>(
          'spaces-token',
          { body: { serverId, channelId } },
        );
        if (fnError || !data?.token) {
          const ctx = (fnError as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
          let detail = fnError?.message;
          if (ctx?.json) {
            try {
              const payload = await ctx.json();
              if (payload?.error) detail = payload.error;
            } catch { /* ignore */ }
          }
          throw new Error(detail || 'Could not join voice channel');
        }

        const room = new Room({ adaptiveStream: true, dynacast: true });
        let speakers = new Set<string>();

        const refresh = () => syncParticipants(room, speakers);

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          detachAudio(participant.identity);
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.setAttribute('playsinline', 'true');
          el.muted = deafenedRef.current;
          document.body.appendChild(el);
          el.play().catch(() => {
            /* resumes on gesture */
          });
          audioElsRef.current.set(participant.identity, el);
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          try {
            track.detach().forEach((el) => el.remove());
          } catch {
            /* ignore */
          }
          detachAudio(participant.identity);
        });

        room.on(RoomEvent.ParticipantConnected, refresh);
        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          detachAudio(participant.identity);
          refresh();
        });
        room.on(RoomEvent.TrackMuted, refresh);
        room.on(RoomEvent.TrackUnmuted, refresh);
        room.on(RoomEvent.LocalTrackPublished, refresh);
        room.on(RoomEvent.LocalTrackUnpublished, refresh);

        room.on(RoomEvent.ActiveSpeakersChanged, (active: Participant[]) => {
          speakers = new Set(active.map((s) => s.identity));
          setActiveSpeakerIds(speakers);
          syncParticipants(room, speakers);
        });

        room.on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
          if (cs === ConnectionState.Connected) setState('connected');
          else if (cs === ConnectionState.Reconnecting) setState('connecting');
          else if (cs === ConnectionState.Disconnected && roomRef.current === room) setState('idle');
        });

        await room.connect(data.url, data.token);

        roomRef.current = room;
        const active: ActiveConnection = { serverId, channelId, channelName };
        connectionRef.current = active;
        setConnection(active);
        setState('connected');
        syncParticipants(room, speakers);

        // Discord-style: join muted, user unmutes when ready
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicEnabled(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Voice connection failed';
        console.warn('[CommunityVoice] connect failed:', msg);
        setError(msg);
        setState('error');
        await disconnect();
      }
    },
    [detachAudio, disconnect, syncParticipants],
  );

  const setMic = useCallback(async (enabled: boolean): Promise<boolean> => {
    const room = roomRef.current;
    if (!room || deafenedRef.current) return false;
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicEnabled(enabled);
      syncParticipants(room, activeSpeakerIds);
      return true;
    } catch (err) {
      console.warn('[CommunityVoice] mic toggle failed:', err);
      return false;
    }
  }, [activeSpeakerIds, syncParticipants]);

  const setDeafened = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      const room = roomRef.current;
      if (!room) return false;

      deafenedRef.current = enabled;
      setDeafenedState(enabled);
      setAllAudioVolume(enabled);

      if (enabled) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
          setMicEnabled(false);
        } catch {
          /* ignore */
        }
      }

      syncParticipants(room, activeSpeakerIds);
      return true;
    },
    [activeSpeakerIds, setAllAudioVolume, syncParticipants],
  );

  const toggleMic = useCallback(async () => {
    if (deafenedRef.current) {
      await setDeafened(false);
      return setMic(true);
    }
    return setMic(!micEnabled);
  }, [micEnabled, setDeafened, setMic]);

  useEffect(() => {
    const resume = () => {
      if (deafenedRef.current) return;
      audioElsRef.current.forEach((el) => el.play().catch(() => { /* ignore */ }));
      const room = roomRef.current;
      if (room && micEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch(() => { /* ignore */ });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('app-resumed', resume);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('app-resumed', resume);
    };
  }, [micEnabled]);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return {
    state,
    error,
    connection,
    participants,
    activeSpeakerIds,
    micEnabled,
    deafened,
    isConnected: state === 'connected' && !!connection,
    connect,
    disconnect,
    setMic,
    setDeafened,
    toggleMic,
  };
}
