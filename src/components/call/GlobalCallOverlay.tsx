/**
 * Global Call Overlay — Dual-Mode Edition (P2P + LiveKit)
 * 
 * Mounted ONCE at app root. Handles two connection modes:
 * 
 * P2P Mode (free): Direct WebRTC via P2PConnection class
 * - Signaling via Supabase Realtime broadcast
 * - No media server, zero cost
 * - No rejoin/linger support
 * 
 * Persistent Mode (premium "Stay On Call"): LiveKit Room SDK
 * - Full SFU with built-in reconnection
 * - Room persistence, rejoin, linger
 * - "Stay On Call" toggle gated by premium status
 * 
 * Mode Switching: controlled reconnect
 * - Tear down current connection
 * - Show "Switching to Stay Connected mode..." UI
 * - Build new connection
 * - Seamless transition for both participants
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, SlidersHorizontal, RefreshCw, Minimize2, Crown, Zap, Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { useCallStore, CallData, CallMode, markCallConnected } from '@/lib/callStore';

import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';
import { db } from '@/lib/firebase';
import { invokeLiveKitCallToken } from '@/lib/livekitCallToken';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { P2PConnection, P2PEvent } from '@/lib/p2pConnection';
import { PaywallSheet } from '@/components/premium/PaywallSheet';
import { triggerHaptic } from '@/lib/haptics';
import { clearWarmCallMedia } from '@/lib/callMediaWarmup';
import { stopCameraStream } from '@/hooks/useCameraPreload';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalTrackPublication,
  ConnectionState,
  DisconnectReason,
  VideoPresets,
} from 'livekit-client';
import { CallSettingsSheet } from './CallSettingsSheet';
import { CallDiagnosticsPanel } from './CallDiagnosticsPanel';
import { MinimizedCallBubble } from './MinimizedCallBubble';
import { SlideToAnswer } from './SlideToAnswer';
import { CallReactions } from './CallReactions';
import { AudioVisualizer } from './AudioVisualizer';
import {
  resetCallDiagnostics,
  updateCallDiagnostics,
  isCallDebugEnabled,
} from '@/lib/callDiagnostics';
import { logCallMedia } from '@/lib/callMediaLog';

const INCOMING_CALL_TIMEOUT_SECONDS = 30;
/** Outbound ring budget — align with 30s callee timeout. */
const OUTBOUND_RING_TIMEOUT_SECONDS = 30;
const CONNECT_TIMEOUT_SECONDS = 60;

/** Subscribe + attach all remote tracks — fixes first-join race when callee publishes late. */
function rescanRemoteTracks(
  room: Room,
  attachRemoteVideo: (track: MediaStreamTrack) => void,
  attachRemoteAudio: (track: MediaStreamTrack) => void,
  reason: string,
): void {
  logCallMedia('subscribe_rescan', { reason, remotes: room.remoteParticipants.size });
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind === Track.Kind.Video && !pub.isSubscribed) {
        pub.setSubscribed(true);
        logCallMedia('remote_track_published', { kind: 'video', participant: participant.identity });
      }
      if (pub.kind === Track.Kind.Audio && !pub.isSubscribed) {
        pub.setSubscribed(true);
        logCallMedia('remote_track_published', { kind: 'audio', participant: participant.identity });
      }
      const mt = pub.track?.mediaStreamTrack;
      if (!mt) continue;
      if (pub.kind === Track.Kind.Video) {
        attachRemoteVideo(mt);
        logCallMedia('remote_video_attached', { participant: participant.identity, reason });
      } else if (pub.kind === Track.Kind.Audio) {
        attachRemoteAudio(mt);
        logCallMedia('remote_audio_attached', { participant: participant.identity, reason });
      }
    }
  }
}

export function GlobalCallOverlay() {
  const navigate = useNavigate();
  const { state, acceptCall, endCall, leaveCall, setPhase, setConnectStage, setError, dismissIncoming, timeoutIncoming, switchMode } = useCallStore();
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const { isPremium } = usePremiumStatus();
  
  // Connection refs — only one active at a time
  const roomRef = useRef<Room | null>(null);          // LiveKit (persistent mode)
  const p2pRef = useRef<P2PConnection | null>(null);
  const p2pPreviewRef = useRef(false);   // P2P mode
  const isLeavingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Video/Audio refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Local UI state
  const [isMuted, setIsMuted] = useState(false);
  // Default to "off" — flipped on for video calls once they connect.
  // Lets the audio-call camera toggle show the correct (off) state at start.
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [hasRemoteParticipant, setHasRemoteParticipant] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [currentMicId, setCurrentMicId] = useState<string | undefined>();
  const [currentCameraId, setCurrentCameraId] = useState<string | undefined>();
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | undefined>();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [p2pFailCount, setP2pFailCount] = useState(0);
  const [incomingReaction, setIncomingReaction] = useState<{ emoji: string; nonce: number } | null>(null);
  const reactionsChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const p2pEndedRef = useRef(false); // Guard against double endCall from P2P events
  
  // Remote user left — linger state (persistent mode only)
  const [remoteUserLeft, setRemoteUserLeft] = useState(false);
  const [autoEndCountdown, setAutoEndCountdown] = useState(0);
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Header/footer auto-hide
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const headerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const footerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Call container ref for PiP drag bounds
  const callContainerRef = useRef<HTMLDivElement>(null);

  // Screen wake lock — keep mic/media alive during calls
  const wakeLockRef = useRef<any>(null);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
  }, []);

  const startJoinTimeout = useCallback((call: CallData) => {
    clearJoinTimeout();
    const callerRinging =
      call.isInitiator && !stateRef.current.remoteAccepted;
    const timeoutMs = callerRinging
      ? OUTBOUND_RING_TIMEOUT_SECONDS * 1000
      : CONNECT_TIMEOUT_SECONDS * 1000;

    joinTimeoutRef.current = setTimeout(() => {
      if (stateRef.current.phase !== 'joining') return;
      const stillRinging =
        call.isInitiator && !stateRef.current.remoteAccepted;
      if (stillRinging) {
        toast.error('No answer');
        // callStore 30s ring timeout marks missed + resets state — avoid overwriting with ended.
        return;
      }
      toast.error('Call failed to connect');
      endCall();
    }, timeoutMs);
  }, [clearJoinTimeout, endCall]);

  // ── Track Attachment Helpers ──────────────────────────────

  const remoteVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  const attachRemoteVideo = useCallback((track: MediaStreamTrack) => {
    remoteVideoTrackRef.current = track;
    let attempts = 0;
    const apply = () => {
      const el = remoteVideoRef.current;
      if (!el) return false;
      el.srcObject = new MediaStream([track]);
      el.playsInline = true;
      el.autoplay = true;
      el.muted = true;
      el.play().catch(() => {});
      setHasRemoteVideo(true);
      return true;
    };
    if (apply()) return;
    const retry = () => {
      if (apply() || attempts++ > 24) return;
      requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
  }, []);

  useEffect(() => {
    if (state.phase !== 'connected' && state.phase !== 'joining') return;
    const track = remoteVideoTrackRef.current;
    if (track) attachRemoteVideo(track);
  }, [state.phase, hasRemoteParticipant, attachRemoteVideo]);

  const attachRemoteAudio = useCallback((track: MediaStreamTrack) => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.muted = false;
    el.volume = 1;
    el.play().catch(() => {});
  }, []);

  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const attachLocalVideo = useCallback((track: MediaStreamTrack) => {
    localTrackRef.current = track;
    setHasLocalVideo(true);
    // Defer attachment to next tick so the <video> element is mounted
    requestAnimationFrame(() => {
      const el = localVideoRef.current;
      if (!el) return;
      el.srcObject = new MediaStream([track]);
      el.play().catch(() => {});
    });
  }, []);

  // ── P2P Connection ────────────────────────────────────────

  const handleP2PEvent = useCallback((event: P2PEvent) => {
    switch (event.type) {
      case 'connected':
        clearJoinTimeout();
        premiumSounds.stopAllCallSounds();
        premiumSounds.callConnect();
        markCallConnected();
        setPhase('connected');
        // Initial camera state — on for video calls, off for audio calls
        setIsVideoOff(stateRef.current.call?.callType !== 'video');
        setIsReconnecting(false);
        setP2pFailCount(0);
        p2pEndedRef.current = false;
        break;

      case 'disconnected':
        if (!isLeavingRef.current && !p2pEndedRef.current) {
          if (event.reason === 'remote-hangup') {
            const isPersistentMode = stateRef.current.call?.callMode === 'persistent';
            const isGroupCall = stateRef.current.call?.isGroupCall;
            setHasRemoteParticipant(false);
            setRemoteUserLeft(true);

            if (isPersistentMode && !isGroupCall) {
              // Persistent 1:1: stay alive indefinitely until local user leaves
              console.log('[CallOverlay] Persistent remote hangup — staying alive indefinitely');
              setAutoEndCountdown(-1);
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
            } else {
              // P2P / default mode: 3-minute linger then auto-end
              console.log('[CallOverlay] P2P remote hangup — entering linger mode (3 min)');
              const LINGER_SECONDS = 180;
              setAutoEndCountdown(LINGER_SECONDS);

              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = setInterval(() => {
                setAutoEndCountdown(prev => {
                  if (prev <= 1) { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); return 0; }
                  return prev - 1;
                });
              }, 1000);

              if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
              autoEndTimerRef.current = setTimeout(() => {
                p2pEndedRef.current = true;
                toast.info('Call ended');
                endCall();
              }, LINGER_SECONDS * 1000);
            }
          }
        }
        break;

      case 'reconnecting':
        setIsReconnecting(true);
        break;

      case 'remote-track':
        if (event.kind === 'video') {
          attachRemoteVideo(event.track);
        } else {
          attachRemoteAudio(event.track);
        }
        break;

      case 'remote-track-removed':
        if (event.kind === 'video') {
          remoteVideoTrackRef.current = null;
          setHasRemoteVideo(false);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        } else {
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        }
        break;

      case 'remote-participant-joined':
        setHasRemoteParticipant(true);
        break;

      case 'remote-participant-left':
        setHasRemoteParticipant(false);
        break;

      case 'ice-failed':
        setP2pFailCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 1) {
            console.log('[CallOverlay] ICE failed — switching to LiveKit');
            toast('Switching to better connection...', { duration: 3000 });
            setTimeout(() => {
              switchMode('persistent').catch(() => {
                toast.error('Connection failed. Please try again.', { duration: 5000 });
              });
            }, 0);
          }
          return newCount;
        });
        break;

      case 'timeout':
        console.log('[CallOverlay] P2P offer timeout — retrying');
        toast.error('Connection taking too long. Retrying...', { duration: 3000 });
        // Retry P2P via a deferred call
        setTimeout(() => {
          if (stateRef.current.call && p2pRef.current) {
            p2pRef.current.disconnect().then(() => {
              p2pRef.current = null;
              if (stateRef.current.call) {
                connectP2PRef.current?.(stateRef.current.call);
              }
            });
          }
        }, 0);
        break;
    }
  }, [clearJoinTimeout, endCall, setPhase, attachRemoteVideo, attachRemoteAudio, switchMode]);

  // Keep P2P event handler fresh to avoid stale closures
  const handleP2PEventRef = useRef(handleP2PEvent);
  useEffect(() => {
    handleP2PEventRef.current = handleP2PEvent;
    // Update the handler on an existing P2P connection
    if (p2pRef.current) {
      p2pRef.current.setOnEvent(handleP2PEvent);
    }
  }, [handleP2PEvent]);
  const connectP2PRef = useRef<((call: CallData) => Promise<void>) | null>(null);

  const connectP2P = useCallback(async (call: CallData) => {
    const localUserId = call.isInitiator ? call.caller.id : (profileId || call.receiver.id);
    if (!localUserId) return;

    clearWarmCallMedia();
    try { stopCameraStream(); } catch {}

    // Reset double-end guard
    p2pEndedRef.current = false;

    // Disconnect existing P2P connection
    if (p2pRef.current) {
      await p2pRef.current.disconnect();
      p2pRef.current = null;
    }

    const p2p = new P2PConnection({
      conversationId: call.conversationId,
      userId: localUserId,
      isInitiator: call.isInitiator,
      callType: call.callType,
      onEvent: (evt) => handleP2PEventRef.current(evt),
      // Attach the local preview the INSTANT the camera opens —
      // don't wait for signaling/handshake to complete.
      onLocalStream: (stream) => {
        if (call.callType === 'video') {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) attachLocalVideo(videoTrack);
        }
      },
    });

    p2pRef.current = p2p;

    try {
      setConnectStage('signaling');
      await p2p.connect();
      // Safety net: if onLocalStream didn't fire (e.g. callback errored),
      // still try to attach now.
      const localStream = p2p.getLocalStream();
      if (localStream && call.callType === 'video' && !localVideoRef.current?.srcObject) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) attachLocalVideo(videoTrack);
      }

      if (import.meta.env.DEV) console.log('[CallOverlay] P2P connection initiated');
    } catch (err: any) {
      console.error('[CallOverlay] P2P connect failed:', err);
      toast.error('Failed to connect');
      endCall();
    }
  }, [profileId, attachLocalVideo, endCall, setConnectStage]);

  // Keep connectP2PRef fresh for deferred calls from event handler
  useEffect(() => { connectP2PRef.current = connectP2P; }, [connectP2P]);

  // ── LiveKit Connection (persistent mode) ──────────────────

  const connectToRoom = useCallback(async (call: CallData) => {
    if (roomRef.current) {
      if (roomRef.current.name === call.roomName && roomRef.current.state === ConnectionState.Connected) {
        return;
      }
      try { await roomRef.current.disconnect(); } catch {}
    }

    clearWarmCallMedia();
    try { stopCameraStream(); } catch {}

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h1080.resolution,
        facingMode: 'user',
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      reconnectPolicy: {
        nextRetryDelayInMs: (ctx) => {
          if (ctx.retryCount > 10) return null;
          return Math.min(250 * Math.pow(2, ctx.retryCount), 3000);
        },
      },
      publishDefaults: {
        simulcast: true,
        dtx: false,
        red: true,
        videoEncoding: {
          maxBitrate: 5_000_000,
          maxFramerate: 30,
          priority: 'high',
        },
        videoSimulcastLayers: [
          VideoPresets.h1080,
          VideoPresets.h720,
          VideoPresets.h540,
        ],
      },
    });

    updateCallDiagnostics({
      connectionType: 'livekit',
      connectionState: 'connecting',
      signalingState: 'connecting',
    });

    logCallMedia('room_create', { room: call.roomName, mode: call.callMode });

    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (participant.isLocal) return;
      logCallMedia('remote_track_subscribed', { kind: track.kind, participant: participant.identity });
      if (track.kind === Track.Kind.Video) {
        const mt = track.mediaStreamTrack;
        if (mt) {
          attachRemoteVideo(mt);
          logCallMedia('remote_video_attached', { participant: participant.identity, via: 'TrackSubscribed' });
        }
      } else if (track.kind === Track.Kind.Audio) {
        const mt = track.mediaStreamTrack;
        if (mt) attachRemoteAudio(mt);
      }
    });

    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (participant.isLocal) return;
      logCallMedia('remote_track_published', { kind: publication.kind, participant: participant.identity });
      if (!publication.isSubscribed) publication.setSubscribed(true);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        setHasRemoteVideo(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      } else if (track.kind === Track.Kind.Audio) {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      }
    });

    room.on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      logCallMedia('local_track_published', { kind: publication.kind });
      if (publication.kind === Track.Kind.Video) {
        const mt = publication.track?.mediaStreamTrack;
        if (mt) {
          attachLocalVideo(mt);
          logCallMedia('camera_init', { width: mt.getSettings?.()?.width });
        }
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      if (publication.kind === Track.Kind.Video) {
        setHasLocalVideo(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      }
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      logCallMedia('participant_connected', { identity: participant.identity });
      setHasRemoteParticipant(true);
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
      rescanRemoteTracks(room, attachRemoteVideo, attachRemoteAudio, 'ParticipantConnected');
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      setHasRemoteParticipant(false);
      setHasRemoteVideo(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      const isGroupCall = stateRef.current.call?.isGroupCall;
      const isPersistent = stateRef.current.call?.callMode === 'persistent';
      setRemoteUserLeft(true);

      if (isPersistent) {
        // Persistent mode (1:1 or group, voice-room behavior): stay alive indefinitely
        setAutoEndCountdown(-1);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
      } else {
        const LINGER_SECONDS = 180; // 3 minutes for non-persistent 1:1
        setAutoEndCountdown(LINGER_SECONDS);

        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = setInterval(() => {
          setAutoEndCountdown(prev => {
            if (prev <= 1) { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);

        if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = setTimeout(() => endCall(), LINGER_SECONDS * 1000);
      }
    });

    room.on(RoomEvent.Reconnecting, () => {
      setIsReconnecting(true);
      updateCallDiagnostics({ connectionState: 'reconnecting' });
    });
    room.on(RoomEvent.Reconnected, () => {
      setIsReconnecting(false);
      updateCallDiagnostics({ connectionState: 'connected' });
    });

    room.on(RoomEvent.ConnectionStateChanged, (connectionState) => {
      updateCallDiagnostics({ connectionState: String(connectionState) });
    });

    room.on(RoomEvent.SignalConnected, () => {
      updateCallDiagnostics({ signalingState: 'connected' });
    });

    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (participant.isLocal) {
        updateCallDiagnostics({ quality: String(quality) });
      }
    });

    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      clearJoinTimeout();
      setIsReconnecting(false);
      if (isLeavingRef.current) return;
      if (stateRef.current.phase === 'connected' || stateRef.current.phase === 'joining') {
        toast.error('Call disconnected');
        endCall();
      }
    });

    room.on(RoomEvent.Connected, () => {
      clearJoinTimeout();
      premiumSounds.stopAllCallSounds();
      premiumSounds.callConnect();
      markCallConnected();
      setPhase('connected');
      setIsVideoOff(stateRef.current.call?.callType !== 'video');
      logCallMedia('room_connected', { room: room.name });
      updateCallDiagnostics({
        connectionState: 'connected',
        signalingState: 'connected',
        iceState: 'connected',
      });
      rescanRemoteTracks(room, attachRemoteVideo, attachRemoteAudio, 'Connected');
    });

    try {
      setConnectStage('connecting-media');
      logCallMedia('room_connecting', { room: call.roomName });
      await room.connect(call.livekitUrl, call.token, { autoSubscribe: true });
      await Promise.all([
        room.localParticipant.setMicrophoneEnabled(true),
        call.callType === 'video'
          ? room.localParticipant.setCameraEnabled(true).catch((err: Error) => {
              setCameraError(err.message || 'Camera failed');
            })
          : Promise.resolve(),
      ]);
      rescanRemoteTracks(room, attachRemoteVideo, attachRemoteAudio, 'post-publish');
      for (const ms of [300, 800, 1500, 3000]) {
        setTimeout(() => {
          if (roomRef.current === room) {
            rescanRemoteTracks(room, attachRemoteVideo, attachRemoteAudio, `retry-${ms}ms`);
          }
        }, ms);
      }
    } catch (err: any) {
      console.error('[CallOverlay] LiveKit connect failed:', err);
      toast.error('Failed to connect');
      endCall();
    }
  }, [attachRemoteVideo, attachRemoteAudio, attachLocalVideo, clearJoinTimeout, endCall, setPhase, setConnectStage]);

  // LiveKit stats → diagnostics panel
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    if (state.phase !== 'connected' && state.phase !== 'joining') {
      if (state.phase === 'idle') resetCallDiagnostics();
      return;
    }

    if (state.call?.callMode !== 'persistent') {
      updateCallDiagnostics({ connectionType: 'p2p' });
      return;
    }

    statsIntervalRef.current = setInterval(async () => {
      const room = roomRef.current;
      if (!room) return;

      const localVideo = localVideoRef.current;
      const w = localVideo?.videoWidth || 0;
      const h = localVideo?.videoHeight || 0;

      const videoBitrateKbps = 0;
      const audioBitrateKbps = 0;
      let packetLossPct = 0;
      let latencyMs = 0;
      let turnInUse = false;
      const iceState = 'unknown';

      try {
        const engine = (room as unknown as { engine?: { client?: { getPublisherStats?: () => Promise<unknown> } } }).engine;
        const stats = engine?.client?.getPublisherStats
          ? await engine.client.getPublisherStats()
          : null;
        if (stats && typeof stats === 'object') {
          const raw = JSON.stringify(stats);
          turnInUse = /relay|turn/i.test(raw);
          const lossMatch = raw.match(/fractionLost["']?\s*:\s*([\d.]+)/i);
          if (lossMatch) packetLossPct = parseFloat(lossMatch[1]) * 100;
          const rttMatch = raw.match(/roundTripTime["']?\s*:\s*([\d.]+)/i);
          if (rttMatch) latencyMs = parseFloat(rttMatch[1]) * 1000;
        }
      } catch {
        // Stats API varies by LiveKit version — best-effort only.
      }

      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const dims = pub?.track?.mediaStreamTrack?.getSettings?.();
      updateCallDiagnostics({
        connectionType: 'livekit',
        videoWidth: dims?.width || w,
        videoHeight: dims?.height || h,
        videoBitrateKbps,
        audioBitrateKbps,
        packetLossPct,
        latencyMs,
        turnInUse,
        iceState,
        connectionState: String(room.state),
      });
    }, 2000);

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [state.phase, state.call?.callMode]);

  // ── Join/Switch Logic ─────────────────────────────────────

  // Handle joining (phase === 'joining')
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call) return;
    if (isLeavingRef.current) return;

    premiumSounds.stopAllCallSounds();
    let cancelled = false;

    const doJoin = async () => {
      if (cancelled) return;

      startJoinTimeout(state.call!);

      // Preview path: callee already joined signaling before accept.
      if (p2pPreviewRef.current && p2pRef.current && state.call!.callMode === 'p2p') {
        try {
          setConnectStage('requesting-media');
          await p2pRef.current.attachLocalMedia();
          p2pPreviewRef.current = false;
          setConnectStage('signaling');
          return;
        } catch (err: unknown) {
          console.error('[CallOverlay] Preview upgrade failed:', err);
          p2pPreviewRef.current = false;
        }
      }

      if (state.call!.callMode === 'persistent') {
        // Persistent mode needs a LiveKit token. For accepted persistent calls,
        // acceptCall fetches the token asynchronously after flipping to 'joining',
        // so the token may not be present yet. Wait for it (up to 8s) before
        // calling room.connect().
        if (!state.call!.token || !state.call!.livekitUrl) {
          const waitStart = Date.now();
          while (!cancelled && (!stateRef.current.call?.token || !stateRef.current.call?.livekitUrl)) {
            if (Date.now() - waitStart > 8000) break;
            await new Promise(r => setTimeout(r, 100));
          }
          if (cancelled) return;
        }
        const ready = stateRef.current.call;
        if (!ready?.token || !ready?.livekitUrl) {
          toast.error('Failed to start call');
          endCall();
          return;
        }
        await connectToRoom(ready);
      } else {
        await connectP2P(state.call!);
      }
    };

    doJoin();
    return () => { cancelled = true; clearJoinTimeout(); };
  }, [state.phase, state.call?.id, state.call?.callMode, clearJoinTimeout, endCall, connectToRoom, connectP2P, startJoinTimeout]);

  // Caller answered — switch from ring budget to connect budget.
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.isInitiator || !state.remoteAccepted) return;
    startJoinTimeout(state.call);
  }, [state.remoteAccepted, state.phase, state.call, startJoinTimeout]);

  // Handle mode switching (phase === 'switching')
  useEffect(() => {
    if (state.phase !== 'switching' || !state.call) return;

    const doSwitch = async () => {
      if (import.meta.env.DEV) console.log('[CallOverlay] Switching to mode:', state.call!.callMode);

      // 1. Tear down current connection
      if (p2pRef.current) {
        await p2pRef.current.disconnect();
        p2pRef.current = null;
      }
      if (roomRef.current) {
        isLeavingRef.current = true;
        try { await roomRef.current.disconnect(); } catch {}
        roomRef.current = null;
        isLeavingRef.current = false;
      }

      // Clear video/audio and timers
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
      setHasLocalVideo(false);
      setHasRemoteVideo(false);
      setHasRemoteParticipant(false);
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      // Clear auto-end timers from persistent mode
      if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

      // 2. Small delay for UI
      await new Promise(r => setTimeout(r, 500));

      // 3. Connect with new mode
      if (state.call!.callMode === 'persistent') {
        // Need token — it should already be set by switchMode in callStore
        if (state.call!.token && state.call!.livekitUrl) {
          await connectToRoom(state.call!);
        } else {
          // Fetch token if not present (e.g. remote-initiated switch)
          try {
            const tokenData = await invokeLiveKitCallToken({
              conversationId: state.call!.conversationId,
              callType: state.call!.callType,
              callId: state.call!.id,
            });
            
            const updatedCall = {
              ...state.call!,
              token: tokenData.token,
              livekitUrl: tokenData.url,
              roomName: tokenData.roomName,
            };
            await connectToRoom(updatedCall);
          } catch (err: any) {
            console.error('[CallOverlay] Switch to persistent failed:', err);
            toast.error('Failed to switch mode');
            endCall();
          }
        }
      } else {
        await connectP2P(state.call!);
      }
    };

    doSwitch();
  }, [state.phase, state.call?.callMode, connectToRoom, connectP2P, endCall]);

  // Force cleanup when state resets to idle
  useEffect(() => {
    if (state.phase !== 'idle') return;
    if (roomRef.current && roomRef.current.state !== ConnectionState.Disconnected) {
      roomRef.current.disconnect();
    }
    if (p2pRef.current) {
      void p2pRef.current.disconnect().catch(() => {});
      p2pRef.current = null;
    }
  }, [state.phase]);

  // Call duration timer
  useEffect(() => {
    if (state.phase !== 'connected') { setCallDuration(0); return; }
    const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [state.phase]);

  // Live emoji reactions — Supabase Realtime broadcast keyed on the call id
  useEffect(() => {
    const callId = state.call?.id;
    if (!callId || !profile?.id) return;
    const ch = db.channel(`call-reactions-${callId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'reaction' }, (msg) => {
      const p: any = msg.payload;
      if (!p?.emoji || p.userId === profile.id) return;
      setIncomingReaction({ emoji: p.emoji, nonce: Date.now() + Math.random() });
    });
    ch.subscribe();
    reactionsChannelRef.current = ch;
    return () => { try { db.removeChannel(ch); } catch {} reactionsChannelRef.current = null; };
  }, [state.call?.id, profile?.id]);

  const sendReaction = useCallback((emoji: string) => {
    const ch = reactionsChannelRef.current;
    if (!ch || !profile?.id) return;
    try { ch.send({ type: 'broadcast', event: 'reaction', payload: { emoji, userId: profile.id } }); } catch {}
  }, [profile?.id]);

  // Track latest mute state without re-binding listeners
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Visibility change — resume media + force-re-enable mic when returning from background
  useEffect(() => {
    if (state.phase !== 'connected') return;

    const reEnableMic = async () => {
      // Only re-enable if user hasn't manually muted
      if (isMutedRef.current) return;
      try {
        if (stateRef.current.call?.callMode === 'persistent' && roomRef.current) {
          await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        } else if (p2pRef.current) {
          p2pRef.current.setMicEnabled(true);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[CallOverlay] Mic re-enable failed:', err);
      }
    };

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        await new Promise(r => setTimeout(r, 300));
        // Resume audio/video elements
        if (remoteAudioRef.current?.srcObject) {
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.play().catch(() => {});
        }
        if (remoteVideoRef.current?.srcObject) {
          remoteVideoRef.current.play().catch(() => {});
        }
        // Force-resume the local mic track (OS may suspend it on background)
        await reEnableMic();
        // Re-acquire wake lock if it was released
        requestWakeLock();
      }
    };

    const handleFocus = () => { reEnableMic(); };

    const handleAppResumed = () => { void handleVisibility(); };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.phase === 'connected' || state.phase === 'joining') {
        e.preventDefault();
        e.returnValue = 'You have an active call. Are you sure you want to leave?';
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('app-resumed', handleAppResumed);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('app-resumed', handleAppResumed);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.phase]);

  // Wake lock — prevent screen sleep from suspending media tracks
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener?.('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[CallOverlay] WakeLock failed:', err);
    }
  }, []);

  useEffect(() => {
    if (state.phase === 'connected') {
      requestWakeLock();
    } else {
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release?.(); } catch {}
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current && state.phase !== 'connected') {
        try { wakeLockRef.current.release?.(); } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [state.phase, requestWakeLock]);

  // ── Control Handlers ──────────────────────────────────────

  const handleLeaveCall = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    isLeavingRef.current = true;

    setCameraError(null);
    setRemoteUserLeft(false);
    setAutoEndCountdown(0);
    if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    if (p2pRef.current) {
      await p2pRef.current.disconnect();
      p2pRef.current = null;
    }
    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }

    leaveCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, leaveCall]);

  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    isLeavingRef.current = true;

    setCameraError(null);
    setRemoteUserLeft(false);
    setAutoEndCountdown(0);
    if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    if (p2pRef.current) {
      await p2pRef.current.disconnect();
      p2pRef.current = null;
    }
    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }

    await endCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, endCall]);

  const handleToggleMute = useCallback(async () => {
    if (state.phase !== 'connected' && state.phase !== 'joining') return;
    const newMuted = !isMuted;

    if (state.call?.callMode === 'persistent' && roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    } else if (p2pRef.current) {
      p2pRef.current.setMicEnabled(!newMuted);
    }
    setIsMuted(newMuted);
  }, [isMuted, state.phase, state.call?.callMode]);

  const handleToggleVideo = useCallback(async () => {
    // Snapchat-style: enable camera while ringing/connecting so the other side sees you live.
    if (state.phase !== 'connected' && state.phase !== 'joining') return;
    try {
      const newOff = !isVideoOff;
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.localParticipant.setCameraEnabled(!newOff);
        // Attach the newly-published local camera track to the PiP preview
        if (!newOff) {
          const cameraPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          const mt = cameraPub?.track?.mediaStreamTrack;
          if (mt) attachLocalVideo(mt);
        } else {
          setHasLocalVideo(false);
        }
      } else if (p2pRef.current) {
        await p2pRef.current.setCameraEnabled(!newOff);
        if (!newOff) {
          const stream = p2pRef.current.getLocalStream();
          const videoTrack = stream?.getVideoTracks()[0];
          if (videoTrack) attachLocalVideo(videoTrack);
        } else {
          setHasLocalVideo(false);
        }
      }
      setIsVideoOff(newOff);
      setCameraError(null);
    } catch (err: any) {
      setCameraError(err.message || 'Failed to toggle camera');
    }
  }, [state.phase, state.call?.callMode, isVideoOff, attachLocalVideo]);

  const handleRetryVideo = useCallback(async () => {
    setCameraError(null);
    try {
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.localParticipant.setCameraEnabled(true);
      } else if (p2pRef.current) {
        await p2pRef.current.setCameraEnabled(true);
      }
      setIsVideoOff(false);
    } catch (err: any) {
      setCameraError(err.message || 'Camera failed');
    }
  }, [state.call?.callMode]);

  // Device changes
  const handleMicChange = useCallback(async (deviceId: string) => {
    try {
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.switchActiveDevice('audioinput', deviceId);
      } else if (p2pRef.current) {
        await p2pRef.current.switchAudioDevice(deviceId);
      }
      setCurrentMicId(deviceId);
      toast.success('Microphone changed');
    } catch { toast.error('Failed to change microphone'); }
  }, [state.call?.callMode]);

  const handleCameraChange = useCallback(async (deviceId: string) => {
    try {
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.switchActiveDevice('videoinput', deviceId);
      } else if (p2pRef.current) {
        await p2pRef.current.switchVideoDevice(deviceId);
      }
      setCurrentCameraId(deviceId);
      toast.success('Camera changed');
    } catch { toast.error('Failed to change camera'); }
  }, [state.call?.callMode]);

  const handleSpeakerChange = useCallback(async (deviceId: string) => {
    try {
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.switchActiveDevice('audiooutput', deviceId);
      }
      // P2P doesn't have speaker switching built-in
      setCurrentSpeakerId(deviceId);
      toast.success('Speaker changed');
    } catch { toast.error('Failed to change speaker'); }
  }, [state.call?.callMode]);

  // "Stay On Call" toggle
  const handleStayOnCallToggle = useCallback(async () => {
    if (!state.call) return;

    if (state.call.callMode === 'persistent') {
      // Already in persistent mode — switch back to P2P
      await switchMode('p2p');
      return;
    }

    // Premium check
    if (!isPremium) {
      setShowPaywall(true);
      return;
    }

    // Switch to persistent mode
    try {
      await switchMode('persistent');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to switch to Stay On Call mode');
    }
  }, [state.call, isPremium, switchMode]);

  // Accept incoming call
  const handleAccept = useCallback(async () => {
    if (!state.call) return;
    // Skip permission probe for both modes — getUserMedia is called inline
    // by P2PConnection / LiveKit and prompts the user from this gesture.
    try {
      await acceptCall(state.call);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept call');
    }
  }, [state.call, acceptCall]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Display info
  const isVideoCall = state.call?.callType === 'video';
  const otherUser = state.call?.isInitiator ? state.call.receiver : state.call?.caller;
  const isGroupCall = state.call?.isGroupCall;
  const groupName = state.call?.groupName;
  const groupAvatar = state.call?.groupAvatar;
  const displayName = isGroupCall && groupName ? groupName : (otherUser?.display_name || otherUser?.username);
  const displayAvatar = isGroupCall ? groupAvatar : otherUser?.avatar_url;
  const displayInitial = isGroupCall && groupName ? groupName.charAt(0) : (otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0));
  const currentMode = state.call?.callMode || 'p2p';

  const handleOpenCallerProfile = useCallback(() => {
    if (isGroupCall || !otherUser?.username) return;
    openFriendProfile(navigate, {
      username: otherUser.username,
      friendshipStatus: 'friends',
    });
  }, [isGroupCall, otherUser?.username, navigate]);
  
  const isVisible = state.phase !== 'idle';
  const isRinging = state.phase === 'ringing' && !state.call?.isInitiator;
  const isConnected = state.phase === 'connected';
  const isSwitching = state.phase === 'switching';
  const isConnecting = state.phase === 'creating' || (state.phase === 'joining' && !state.call?.isInitiator);
  const isRingingOut = state.call?.isInitiator && !hasRemoteParticipant && (state.phase === 'joining' || state.phase === 'connected');
  const mediaActive = state.phase === 'joining' || state.phase === 'connected';

  // Pre-connect incoming P2P calls so caller's live camera shows before accept (Snapchat-style).
  useEffect(() => {
    if (state.phase !== 'ringing' || !state.call || state.call.isInitiator || state.call.callMode !== 'p2p') return;
    if (!profileId || p2pRef.current) return;

    const call = state.call;
    const p2p = new P2PConnection({
      conversationId: call.conversationId,
      userId: profileId,
      isInitiator: false,
      callType: call.callType,
      onEvent: (evt) => handleP2PEventRef.current(evt),
    });
    p2pRef.current = p2p;
    p2pPreviewRef.current = true;

    void p2p.connectPreview().catch((err) => {
      console.warn('[CallOverlay] Incoming preview connect failed:', err);
      if (p2pRef.current === p2p) {
        p2pRef.current = null;
        p2pPreviewRef.current = false;
      }
    });

    return () => {
      if (p2pPreviewRef.current && stateRef.current.phase === 'ringing' && p2pRef.current === p2p) {
        void p2p.disconnect();
        p2pRef.current = null;
        p2pPreviewRef.current = false;
      }
    };
  }, [state.phase, state.call?.id, state.call?.isInitiator, state.call?.callMode, profileId]);

  // Incoming overlay unmounts on accept — re-bind remote video to the main call UI.
  useEffect(() => {
    if (isRinging) return;
    const track = remoteVideoTrackRef.current;
    if (!track || !hasRemoteVideo) return;
    requestAnimationFrame(() => {
      const el = remoteVideoRef.current;
      if (!el) return;
      el.srcObject = new MediaStream([track]);
      el.play().catch(() => {});
    });
  }, [isRinging, hasRemoteVideo, state.phase]);

  const stageLabel = (() => {
    switch (state.connectStage) {
      case 'requesting-media': return state.call?.callType === 'video' ? 'Turning on camera…' : 'Turning on microphone…';
      case 'media-ready': return 'Camera ready';
      case 'fetching-token': return 'Securing the line…';
      case 'ringing': return 'Ringing…';
      case 'signaling': return 'Connecting to the other side…';
      case 'connecting-media': return 'Negotiating audio & video…';
      case 'ready': return 'Connected';
      default: return 'Connecting…';
    }
  })();
  const stageProgress = (() => {
    switch (state.connectStage) {
      case 'requesting-media': return 15;
      case 'media-ready': return 30;
      case 'fetching-token': return 45;
      case 'ringing': return 55;
      case 'signaling': return 65;
      case 'connecting-media': return 85;
      case 'ready': return 100;
      default: return 10;
    }
  })();

  // Minimize/expand
  const handleMinimize = useCallback(() => setIsMinimized(true), []);
  const handleExpand = useCallback(() => setIsMinimized(false), []);

  // Reset on call end
  useEffect(() => {
    if (state.phase === 'idle') {
      p2pPreviewRef.current = false;
      setIsMinimized(false);
      setShowHeader(true);
      setShowFooter(true);
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      setHasRemoteParticipant(false);
      remoteVideoTrackRef.current = null;
      setHasRemoteVideo(false);
      setHasLocalVideo(false);
      setIsMuted(false);
      setIsVideoOff(true);
      setIsReconnecting(false);
      setP2pFailCount(0);
      if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    }
  }, [state.phase]);

  // Auto-hide header/footer
  useEffect(() => {
    if (isConnected && !isMinimized) {
      headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 3000);
      footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 3000);
    }
    return () => {
      if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
      if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current);
    };
  }, [isConnected, isMinimized]);

  const showControlsTemporarily = useCallback(() => {
    setShowHeader(true); setShowFooter(true);
    if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current);
    if (isConnected) {
      headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 3000);
      footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 3000);
    }
  }, [isConnected]);

  const handleHeaderAreaEnter = useCallback(() => { if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current); setShowHeader(true); }, []);
  const handleHeaderAreaLeave = useCallback(() => { if (isConnected) headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 1500); }, [isConnected]);
  const handleFooterAreaEnter = useCallback(() => { if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current); setShowFooter(true); }, []);
  const handleFooterAreaLeave = useCallback(() => { if (isConnected) footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 1500); }, [isConnected]);
  const handleScreenTap = useCallback(() => { showControlsTemporarily(); }, [showControlsTemporarily]);

  return (
    <>
      {/* Audio element — always mounted during active call */}
      {isVisible && !isRinging && (
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0 }} />
      )}

      {/* Minimized Call Bubble */}
      <AnimatePresence>
        {isVisible && !isRinging && isMinimized && (
          <MinimizedCallBubble
            displayName={displayName || 'Call'}
            displayAvatar={displayAvatar}
            isVideoCall={isVideoCall}
            duration={callDuration}
            hasRemoteVideo={hasRemoteVideo}
            onExpand={handleExpand}
          />
        )}
      </AnimatePresence>

      {/* Main Call UI */}
      {isVisible && !isRinging && (
        <div
          ref={callContainerRef}
          className="fixed inset-0 z-[99999] transition-opacity duration-300"
          style={{
            opacity: isMinimized ? 0 : 1,
            pointerEvents: isMinimized ? 'none' : 'auto',
            visibility: isMinimized ? 'hidden' : 'visible',
            background: 'rgba(8, 8, 16, 0.85)',
            backdropFilter: 'blur(40px) saturate(150%)',
            WebkitBackdropFilter: 'blur(40px) saturate(150%)',
            isolation: 'isolate',
            paddingTop: 'var(--sat, env(safe-area-inset-top, 0px))',
            paddingBottom: 'var(--sab, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Animated ambient blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.3, 0.9, 1] }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.15]"
              style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0], scale: [1, 1.2, 1.1, 1] }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-32 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.12]"
              style={{ background: 'radial-gradient(circle, hsl(280 80% 60%) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ x: [0, 30, -30, 0], y: [0, -40, 30, 0] }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
              style={{ background: 'radial-gradient(circle, hsl(200 80% 50%) 0%, transparent 60%)' }}
            />
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
            {/* Top vignette */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)' }} />
          </div>

          {/* Mode switching overlay */}
          <AnimatePresence>
            {isSwitching && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
              >
                <div className="text-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                    <Zap className="h-12 w-12 text-primary mx-auto" />
                  </motion.div>
                  <p className="mt-4 text-white text-lg font-medium">
                    {currentMode === 'persistent' ? 'Switching to Stay Connected mode…' : 'Switching to standard mode…'}
                  </p>
                  <p className="mt-2 text-white/50 text-sm">Both participants will be reconnected</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reconnecting banner */}
          <AnimatePresence>
            {isReconnecting && !isSwitching && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-4 left-4 right-4 z-50">
                <div className="p-3 rounded-xl backdrop-blur-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                  <span className="text-yellow-200 text-sm font-medium">Reconnecting...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Remote video — full-bg whenever a remote video track is published
              (works on video calls AND on audio calls where someone enabled camera) */}
          <div className="absolute inset-0" onClick={handleScreenTap} onTouchEnd={handleScreenTap}>
            <video ref={remoteVideoRef} autoPlay playsInline muted className={cn("w-full h-full object-cover transition-opacity duration-200", hasRemoteVideo ? "opacity-100" : "opacity-0 pointer-events-none")} style={{ willChange: 'auto', transform: 'translateZ(0)' }} />
            {isVideoCall && !hasRemoteVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative text-center">
                  <div className="animate-pulse">
                    <Avatar className="h-28 w-28 sm:h-40 sm:w-40 ring-4 ring-white/10 shadow-2xl">
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-4xl sm:text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                    </Avatar>
                  </div>
                  {isRingingOut && <p className="mt-4 sm:mt-6 text-white/60 text-base sm:text-lg font-light animate-pulse">Ringing...</p>}
                  {!isConnected && !isRingingOut && <p className="mt-4 sm:mt-6 text-white/60 text-base sm:text-lg font-light animate-pulse">Waiting for video...</p>}
                </div>
              </div>
            )}
          </div>

          {/* Local camera PiP — shown whenever local camera is on, on any call type */}
          {hasLocalVideo && !isVideoOff && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: 'linear' }}
              drag
              dragMomentum={false}
              dragElastic={0}
              dragConstraints={callContainerRef}
              whileDrag={{ cursor: 'grabbing' }}
              className="absolute top-20 sm:top-24 right-3 sm:right-4 w-24 h-36 sm:w-32 sm:h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/30 z-30 cursor-grab touch-none active:ring-primary/60"
              style={{ touchAction: 'none' }}
            >
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover pointer-events-none" style={{ transform: 'scaleX(-1) translateZ(0)' }} />
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/40 to-transparent pointer-events-none flex items-end justify-center pb-1">
                <div className="w-8 h-1 rounded-full bg-white/40" />
              </div>
            </motion.div>
          )}


          {/* Audio Call — Avatar aura (hidden when remote video takes over) */}
          {!isVideoCall && !hasRemoteVideo && (
            <div className="absolute inset-0 flex items-center justify-center" onClick={handleScreenTap} onTouchEnd={handleScreenTap}>
              <div className="text-center px-4">
                {/* Square aura container — keeps every ring perfectly concentric */}
                <div className="relative mx-auto h-32 w-32 sm:h-40 sm:w-40 grid place-items-center">
                  {/* Audio Visualizer — fixed square that's larger than the
                      breathing rings (which scale to 1.5x). Sized to match
                      its SVG so the bars stay perfectly concentric with the
                      avatar at every breakpoint. */}
                  {isConnected && !remoteUserLeft && (
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none h-[220px] w-[220px] sm:h-[280px] sm:w-[280px]">
                      <AudioVisualizer
                        size={280}
                        stream={remoteAudioRef.current?.srcObject as MediaStream | null}
                        active={isConnected}
                      />
                    </div>
                  )}

                  {/* Synchronized 3-ring breathing aura — same 3s cycle, phase-offset for depth */}
                  {(() => {
                    const dim = remoteUserLeft ? 0.6 : 1; // soften when alone
                    const baseColor = remoteUserLeft ? 'hsl(0 0% 100% / 0.35)' : 'hsl(var(--primary) / 0.45)';
                    return (
                      <>
                        <motion.div
                          aria-hidden
                          animate={{ scale: [1, 1.5], opacity: [0.35 * dim, 0] }}
                          transition={{ repeat: Infinity, duration: 3, ease: 'easeOut' }}
                          className="absolute inset-0 m-auto rounded-full border"
                          style={{ width: '100%', height: '100%', borderColor: baseColor }}
                        />
                        <motion.div
                          aria-hidden
                          animate={{ scale: [1, 1.5], opacity: [0.25 * dim, 0] }}
                          transition={{ repeat: Infinity, duration: 3, ease: 'easeOut', delay: 1 }}
                          className="absolute inset-0 m-auto rounded-full border"
                          style={{ width: '100%', height: '100%', borderColor: baseColor }}
                        />
                        <motion.div
                          aria-hidden
                          animate={{ scale: [1, 1.5], opacity: [0.18 * dim, 0] }}
                          transition={{ repeat: Infinity, duration: 3, ease: 'easeOut', delay: 2 }}
                          className="absolute inset-0 m-auto rounded-full border"
                          style={{ width: '100%', height: '100%', borderColor: baseColor }}
                        />
                        {/* Soft glow halo — same 3s timeline */}
                        <motion.div
                          aria-hidden
                          animate={{ scale: [1, 1.08, 1], opacity: [0.35 * dim, 0.55 * dim, 0.35 * dim] }}
                          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                          className="absolute inset-0 m-auto rounded-full blur-2xl"
                          style={{
                            width: '100%',
                            height: '100%',
                            background: remoteUserLeft
                              ? 'radial-gradient(circle, hsl(0 0% 100% / 0.18), transparent 70%)'
                              : 'linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--accent) / 0.3))',
                          }}
                        />
                      </>
                    );
                  })()}

                  <motion.div
                    animate={{ scale: [1, 1.03, 1] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="relative z-10"
                  >
                    <button
                      type="button"
                      onClick={handleOpenCallerProfile}
                      className="relative z-10 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      aria-label="View profile"
                    >
                      <Avatar className={`h-32 w-32 sm:h-40 sm:w-40 ring-4 ring-white/10 shadow-2xl transition-opacity duration-500 ${remoteUserLeft ? 'opacity-80' : ''}`}>
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="text-4xl sm:text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                      </Avatar>
                    </button>
                  </motion.div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCallerProfile}
                  className="mt-4 sm:mt-6 text-xl sm:text-2xl font-bold text-white tracking-tight hover:opacity-90"
                >
                  {displayName}
                </button>
                {!isConnected && (
                  <div className="mt-3 sm:mt-4 flex flex-col items-center">
                    <motion.p
                      key={state.connectStage || (isRingingOut ? 'ringing' : 'connecting')}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-white/70 text-sm sm:text-base font-light tracking-wide"
                    >
                      {isRingingOut ? 'Ringing…' : stageLabel}
                    </motion.p>
                    <div className="mt-3 h-[2px] w-40 sm:w-48 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        animate={{ width: `${isRingingOut ? 50 : stageProgress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-primary via-purple-500 to-accent"
                      />
                    </div>
                  </div>
                )}
                {isConnected && !isRingingOut && !remoteUserLeft && (
                  <p className="mt-2 text-white/70 text-base sm:text-lg font-mono">{formatDuration(callDuration)}</p>
                )}
                {isConnected && remoteUserLeft && (
                  <p className="mt-3 text-white/50 text-xs sm:text-sm">{displayName} left · they can rejoin</p>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div className="absolute top-0 left-0 right-0 h-24 z-50 pointer-events-auto" style={{ paddingTop: 'var(--sat, env(safe-area-inset-top, 0px))' }} onMouseEnter={handleHeaderAreaEnter} onMouseLeave={handleHeaderAreaLeave} onTouchStart={showControlsTemporarily}>
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: showHeader ? 0 : -100, opacity: showHeader ? 1 : 0 }} transition={{ duration: 0.3, ease: "linear" }} className="pointer-events-auto">
              <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 p-3 sm:p-4 rounded-[20px] backdrop-blur-2xl bg-black/40 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-10 w-10 sm:h-12 sm:w-12 ring-2 ring-white/20 shadow-lg">
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold text-sm sm:text-base">{displayInitial}</AvatarFallback>
                      </Avatar>
                      {isConnected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-black/50" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold text-base sm:text-lg truncate">{displayName}</p>
                      <div className="flex items-center gap-2">
                        {isConnecting && !isRingingOut && (
                          <motion.div className="flex items-center gap-1.5 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
                            <span className="text-xs sm:text-sm">Connecting</span>
                          </motion.div>
                        )}
                        {isRingingOut && (
                          <motion.div className="flex items-center gap-1.5 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" /></span>
                            <span className="text-xs sm:text-sm">Ringing</span>
                          </motion.div>
                        )}
                        {isConnected && !isRingingOut && (
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="flex h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-white/70 text-xs sm:text-sm font-mono tracking-wide">{formatDuration(callDuration)}</span>
                            {currentMode === 'persistent' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/30">
                                <Crown className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary" />
                                <span className="text-[9px] sm:text-[10px] text-primary font-medium">Stay On</span>
                              </span>
                            )}
                          </div>
                        )}
                        {isReconnecting && (
                          <div className="flex items-center gap-1.5 text-yellow-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-xs sm:text-sm">Reconnecting</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
                      {isVideoCall ? <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70" /> : <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70" />}
                    </div>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleMinimize} className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" title="Minimize call">
                      <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/70" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stage-aware connecting status is now inlined under the centered avatar/name */}

          {/* Remote user left — calm chip (no pink, no countdown frenzy) */}
          <AnimatePresence>
            {remoteUserLeft && isConnected && autoEndCountdown !== -1 && autoEndCountdown > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute top-28 left-1/2 -translate-x-1/2 z-50"
              >
                <div className="px-3 py-1.5 rounded-full backdrop-blur-xl bg-white/10 border border-white/15 text-white/70 text-xs font-medium tracking-wide">
                  Call ends in {Math.floor(autoEndCountdown / 60)}:{(autoEndCountdown % 60).toString().padStart(2, '0')}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer controls */}
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: showFooter ? 0 : 100, opacity: showFooter ? 1 : 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute bottom-0 left-0 right-0 pointer-events-auto"
            style={{ paddingBottom: 'max(0.75rem, var(--sab, env(safe-area-inset-bottom, 0px)))' }}
            onMouseEnter={handleFooterAreaEnter}
            onMouseLeave={handleFooterAreaLeave}
            onTouchStart={handleFooterAreaEnter}
          >
            <div className="flex flex-col items-center gap-2 px-3">
              {/* Secondary row (smaller) */}
              <div className="inline-flex items-center gap-2 p-1.5 rounded-2xl backdrop-blur-xl bg-black/20 border border-white/[0.05]">
                {/* Settings */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    triggerHaptic('light');
                    if (isCallDebugEnabled()) setDiagnosticsOpen(true);
                    else setSettingsOpen(true);
                  }}
                  onContextMenu={(e) => {
                    if (!isCallDebugEnabled()) return;
                    e.preventDefault();
                    setDiagnosticsOpen(true);
                  }}
                  className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0 flex items-center justify-center transition-all", "bg-white/10 text-white/70 hover:bg-white/20")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </motion.button>

                {/* Stay On Call */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { triggerHaptic('medium'); handleStayOnCallToggle(); }}
                  disabled={!isConnected || isSwitching}
                  className={cn(
                    "h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0 flex items-center justify-center transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    currentMode === 'persistent'
                      ? "bg-gradient-to-br from-primary to-accent text-white shadow-lg ring-1 ring-primary/50"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  )}
                  title={currentMode === 'persistent' ? 'Stay On Call (active)' : 'Stay On Call (premium)'}
                >
                  <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {!isPremium && currentMode !== 'persistent' && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-500 flex items-center justify-center">
                      <span className="text-[6px] font-bold text-black">PRO</span>
                    </span>
                  )}
                </motion.button>

                {/* Camera flip (video only) */}
                {isVideoCall && (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => triggerHaptic('light')} disabled={!isConnected} className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-white/10 text-white/70 hover:bg-white/20 disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </motion.button>
                )}
              </div>

              {/* Primary row (larger, dominant) */}
              <div className="inline-flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-[20px] backdrop-blur-2xl bg-black/40 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Reactions */}
                <CallReactions onReaction={sendReaction} incomingReaction={incomingReaction} />

                <div className="w-px h-8 sm:h-10 bg-white/20 flex-shrink-0" />

                {/* Mute */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { triggerHaptic('medium'); handleToggleMute(); }} disabled={!mediaActive} className={cn("relative h-11 w-11 sm:h-14 sm:w-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isMuted ? "bg-white text-black shadow-lg ring-2 ring-primary/50" : "bg-white/10 text-white hover:bg-white/20")}>
                  {isMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
                </motion.button>

                {/* Video toggle — available on audio calls too (enables camera mid-call) */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { triggerHaptic('medium'); handleToggleVideo(); }} disabled={!mediaActive} className={cn("relative h-11 w-11 sm:h-14 sm:w-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isVideoOff ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-black shadow-lg ring-2 ring-accent/50")} title={isVideoOff ? "Turn camera on" : "Turn camera off"}>
                  {isVideoOff ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
                </motion.button>

                <div className="w-px h-8 sm:h-10 bg-white/20 flex-shrink-0" />

                {/* End Call — Wide red pill (2x width) */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    triggerHaptic('heavy');
                    if (currentMode === 'persistent') handleLeaveCall();
                    else handleHangup();
                  }}
                  disabled={isHangingUp}
                  className={cn(
                    "relative h-11 sm:h-14 px-6 sm:px-8 rounded-full flex-shrink-0 flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-300",
                    "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg",
                    "hover:from-red-600 hover:to-red-700",
                    "disabled:opacity-70"
                  )}
                >
                  {isHangingUp ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : (<><PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" /><span className="font-semibold text-sm sm:text-base">{currentMode === 'persistent' ? 'Leave' : 'End'}</span></>)}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Incoming call — Snapchat-style full-screen overlay (portal → body) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isRinging && state.call && (
            <IncomingCallFullscreen
              key={`incoming-${state.call.id}`}
              call={state.call}
              hasRemoteVideo={hasRemoteVideo}
              remoteVideoRef={remoteVideoRef}
              onAccept={handleAccept}
              onDecline={dismissIncoming}
              onTimeout={timeoutIncoming}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Settings Sheet */}
      <CallSettingsSheet
        isOpen={settingsOpen}
        onOpenChange={setSettingsOpen}
        onMicChange={handleMicChange}
        onCameraChange={handleCameraChange}
        onSpeakerChange={handleSpeakerChange}
        currentMic={currentMicId}
        currentCamera={currentCameraId}
        currentSpeaker={currentSpeakerId}
        isVideoCall={isVideoCall}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
      />

      {isCallDebugEnabled() && (
        <CallDiagnosticsPanel open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} />
      )}

      {/* Paywall Sheet for non-premium users */}
      <PaywallSheet open={showPaywall} onOpenChange={setShowPaywall} />
    </>
  );
}

// ── Incoming Call — Snapchat-style full-screen overlay ────────

function IncomingCallFullscreen({
  call,
  hasRemoteVideo = false,
  remoteVideoRef,
  onAccept,
  onDecline,
  onTimeout,
}: {
  call: CallData;
  hasRemoteVideo?: boolean;
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(INCOMING_CALL_TIMEOUT_SECONDS);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const isVideoCall = call.callType === 'video';
  const caller = call.caller;
  const isGroupCall = call.isGroupCall;
  const groupName = call.groupName;
  const groupAvatar = call.groupAvatar;
  const displayName = isGroupCall && groupName ? groupName : (caller?.display_name || caller?.username || 'Unknown');
  const displayAvatar = isGroupCall ? groupAvatar : caller?.avatar_url;
  const displayInitial = isGroupCall && groupName
    ? groupName.charAt(0)
    : (caller?.display_name?.charAt(0) || caller?.username?.charAt(0) || '?');

  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    document.body.classList.add('vybe-incoming-call-active');
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('vybe-incoming-call-active');
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onTimeoutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    triggerHaptic('success');
    onAccept();
  };

  const handleDecline = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    triggerHaptic('heavy');
    callSounds.end();
    onDecline();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="vybe-incoming-call-overlay fixed inset-0 z-[999999] flex flex-col overflow-hidden touch-none"
      style={{
        height: '100dvh',
        width: '100vw',
        isolation: 'isolate',
      }}
    >
      {/* Blurred caller wallpaper (Snapchat-style) */}
      {displayAvatar ? (
        <img
          src={displayAvatar}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover scale-110 blur-3xl opacity-60"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 30% 20%, hsl(var(--primary) / 0.45), transparent 55%), radial-gradient(circle at 70% 80%, hsl(var(--accent) / 0.35), transparent 50%), hsl(240 12% 6%)',
          }}
        />
      )}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />

      {/* Live caller video (Snapchat-style) — visible before you answer */}
      {remoteVideoRef && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'absolute inset-0 h-full w-full object-cover z-[1] transition-opacity duration-300',
            hasRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        />
      )}

      {/* Top — avatar + identity */}
      <div
        className={cn(
          'relative z-10 flex flex-col items-center flex-1 justify-end px-6 pb-8 transition-opacity duration-300',
          hasRemoteVideo ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
        style={{ paddingTop: 'var(--app-header-safe, env(safe-area-inset-top, 0px))' }}
      >
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="relative mb-8"
        >
          <motion.div
            animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-white/30"
            style={{ margin: '-12px' }}
          />
          <Avatar className="h-36 w-36 sm:h-44 sm:w-44 ring-4 ring-white/20 shadow-2xl">
            <AvatarImage src={displayAvatar || undefined} />
            <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
              {displayInitial}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center tracking-tight mb-2">
          {displayName}
        </h1>
        <motion.p
          className="text-white/70 text-lg sm:text-xl font-medium"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
        >
          {isGroupCall
            ? `${caller?.display_name || caller?.username || 'Someone'} is calling…`
            : isVideoCall ? 'Video Chat' : 'Audio Call'}
        </motion.p>
        <div className="mt-3 flex justify-center opacity-40">
          <VybeWordmark size="sm" />
        </div>
      </div>

      {/* Bottom — slide + quick actions */}
      <div
        className="relative z-10 w-full px-6"
        style={{ paddingBottom: 'max(0.75rem, var(--sab, env(safe-area-inset-bottom, 0px)))' }}
      >
        <div className="w-full max-w-md mx-auto mb-6">
          <SlideToAnswer
            isVideoCall={isVideoCall}
            onAccept={handleAccept}
            onDecline={handleDecline}
            disabled={isProcessing}
          />
        </div>

        <div className="flex items-center justify-center gap-10 sm:gap-14">
          <div className="flex flex-col items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleDecline}
              disabled={isProcessing}
              className="h-16 w-16 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/40 flex items-center justify-center disabled:opacity-60"
              aria-label="Decline call"
            >
              <PhoneOff className="h-7 w-7" />
            </motion.button>
            <span className="text-white/80 text-sm font-medium">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleAccept}
              disabled={isProcessing}
              className="h-16 w-16 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/40 flex items-center justify-center disabled:opacity-60"
              aria-label="Accept call"
            >
              {isVideoCall ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </motion.button>
            <span className="text-white/80 text-sm font-medium">Accept</span>
          </div>
        </div>

        <p className="text-center text-white/35 text-xs mt-5">
          Auto-declining in {timeLeft}s
        </p>
      </div>
    </motion.div>
  );
}
