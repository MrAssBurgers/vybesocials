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
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, SlidersHorizontal, RefreshCw, Minimize2, Crown, Zap, Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData, CallMode } from '@/lib/callStore';

import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { P2PConnection, P2PEvent } from '@/lib/p2pConnection';
import { PaywallSheet } from '@/components/premium/PaywallSheet';
import { triggerHaptic } from '@/lib/haptics';
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
import { MinimizedCallBubble } from './MinimizedCallBubble';
import { SlideToAnswer } from './SlideToAnswer';
import { CallReactions } from './CallReactions';
import { AudioVisualizer } from './AudioVisualizer';

const INCOMING_CALL_TIMEOUT_SECONDS = 30;

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, leaveCall, setPhase, setConnectStage, setError, dismissIncoming, switchMode } = useCallStore();
  const { profile } = useAuth();
  const { isPremium } = usePremiumStatus();
  
  // Connection refs — only one active at a time
  const roomRef = useRef<Room | null>(null);          // LiveKit (persistent mode)
  const p2pRef = useRef<P2PConnection | null>(null);   // P2P mode
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
  const [currentMicId, setCurrentMicId] = useState<string | undefined>();
  const [currentCameraId, setCurrentCameraId] = useState<string | undefined>();
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | undefined>();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [p2pFailCount, setP2pFailCount] = useState(0);
  const [incomingReaction, setIncomingReaction] = useState<{ emoji: string; nonce: number } | null>(null);
  const reactionsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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

  // ── Track Attachment Helpers ──────────────────────────────

  const attachRemoteVideo = useCallback((track: MediaStreamTrack) => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    setHasRemoteVideo(true);
  }, []);

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
          if (newCount >= 2) {
            console.log('[CallOverlay] ICE failed multiple times, attempting fallback...');
            toast('Switching to better connection...', { duration: 3000 });
            // Use a timeout to avoid calling switchMode during render
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
    if (!profile?.id) return;

    // Reset double-end guard
    p2pEndedRef.current = false;

    // Disconnect existing P2P connection
    if (p2pRef.current) {
      await p2pRef.current.disconnect();
      p2pRef.current = null;
    }

    const p2p = new P2PConnection({
      conversationId: call.conversationId,
      userId: profile.id,
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
  }, [profile?.id, attachLocalVideo, endCall, setConnectStage]);

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

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      // Aggressive reconnection so brief network blips don't drop the call
      reconnectPolicy: {
        nextRetryDelayInMs: (ctx) => {
          if (ctx.retryCount > 8) return null;
          // 250ms, 500ms, 1s, 1s, 1.5s, 1.5s, 2s, 2s
          return Math.min(250 * Math.pow(2, ctx.retryCount), 2000);
        },
      },
      // Faster initial peer connection setup
      publishDefaults: { simulcast: true },
    });

    roomRef.current = room;

    // Track subscribed
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        const mt = track.mediaStreamTrack;
        if (mt) attachRemoteVideo(mt);
      } else if (track.kind === Track.Kind.Audio) {
        const mt = track.mediaStreamTrack;
        if (mt) attachRemoteAudio(mt);
      }
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
      if (publication.kind === Track.Kind.Video) {
        const mt = publication.track?.mediaStreamTrack;
        if (mt) attachLocalVideo(mt);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      if (publication.kind === Track.Kind.Video) {
        setHasLocalVideo(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      setHasRemoteParticipant(true);
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      setHasRemoteParticipant(false);
      setHasRemoteVideo(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      const isGroupCall = stateRef.current.call?.isGroupCall;
      const isPersistent = currentMode === 'persistent';
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

    room.on(RoomEvent.Reconnecting, () => setIsReconnecting(true));
    room.on(RoomEvent.Reconnected, () => setIsReconnecting(false));

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
      setPhase('connected');
      setIsVideoOff(stateRef.current.call?.callType !== 'video');

      const remotes = Array.from(room.remoteParticipants.values());
      if (remotes.length > 0) {
        setHasRemoteParticipant(true);
        remotes.forEach(p => {
          p.trackPublications.forEach(pub => {
            if (pub.track && pub.isSubscribed) {
              const mt = pub.track.mediaStreamTrack;
              if (pub.kind === Track.Kind.Video && mt) attachRemoteVideo(mt);
              else if (pub.kind === Track.Kind.Audio && mt) attachRemoteAudio(mt);
            }
          });
        });
      }
    });

    try {
      setConnectStage('connecting-media');
      await room.connect(call.livekitUrl, call.token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);
      if (call.callType === 'video') {
        try { await room.localParticipant.setCameraEnabled(true); } catch (err: any) {
          setCameraError(err.message || 'Camera failed');
        }
      }
    } catch (err: any) {
      console.error('[CallOverlay] LiveKit connect failed:', err);
      toast.error('Failed to connect');
      endCall();
    }
  }, [attachRemoteVideo, attachRemoteAudio, attachLocalVideo, clearJoinTimeout, endCall, setPhase, setConnectStage]);

  // ── Join/Switch Logic ─────────────────────────────────────

  // Handle joining (phase === 'joining')
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call) return;
    if (isLeavingRef.current) return;

    premiumSounds.stopAllCallSounds();
    let cancelled = false;

    const doJoin = async () => {
      // NOTE: We intentionally skip requestCallMediaPermissions here for
      // BOTH p2p AND persistent. P2PConnection.connect() and LiveKit's
      // setMicrophoneEnabled/setCameraEnabled both call getUserMedia
      // themselves and trigger the OS prompt inline — pre-probing here
      // just doubles the cost and (on iOS) can cause NotReadableError.
      if (cancelled) return;

      clearJoinTimeout();
      // Keep caller join timeout aligned with the incoming-call answer window.
      const timeout = INCOMING_CALL_TIMEOUT_SECONDS * 1000;
      joinTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.phase === 'joining') {
          toast.error('Call failed to connect');
          endCall();
        }
      }, timeout);

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
  }, [state.phase, state.call?.id, state.call?.callMode, clearJoinTimeout, endCall, connectToRoom, connectP2P]);

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
            const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
              body: {
                conversationId: state.call!.conversationId,
                callType: state.call!.callType,
                callId: state.call!.id,
              },
            });
            if (tokenError || !tokenData?.token) throw new Error('Failed to get token');
            
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
    const ch = supabase.channel(`call-reactions-${callId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'reaction' }, (msg) => {
      const p: any = msg.payload;
      if (!p?.emoji || p.userId === profile.id) return;
      setIncomingReaction({ emoji: p.emoji, nonce: Date.now() + Math.random() });
    });
    ch.subscribe();
    reactionsChannelRef.current = ch;
    return () => { try { supabase.removeChannel(ch); } catch {} reactionsChannelRef.current = null; };
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

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.phase === 'connected' || state.phase === 'joining') {
        e.preventDefault();
        e.returnValue = 'You have an active call. Are you sure you want to leave?';
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
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
    if (state.phase !== 'connected') return;
    const newMuted = !isMuted;

    if (state.call?.callMode === 'persistent' && roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    } else if (p2pRef.current) {
      p2pRef.current.setMicEnabled(!newMuted);
    }
    setIsMuted(newMuted);
  }, [isMuted, state.phase, state.call?.callMode]);

  const handleToggleVideo = useCallback(async () => {
    // Allow toggling camera on ANY connected call (audio or video).
    // Enabling camera mid audio-call upgrades the connection — both P2P
    // (renegotiates) and LiveKit support adding video tracks on the fly.
    if (state.phase !== 'connected') return;
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
  
  const isVisible = state.phase !== 'idle';
  const isRinging = state.phase === 'ringing' && !state.call?.isInitiator;
  const isConnected = state.phase === 'connected';
  const isSwitching = state.phase === 'switching';
  const isConnecting = state.phase === 'creating' || (state.phase === 'joining' && !state.call?.isInitiator);
  const isRingingOut = state.call?.isInitiator && !hasRemoteParticipant && (state.phase === 'joining' || state.phase === 'connected');

  const stageLabel = (() => {
    switch (state.connectStage) {
      case 'requesting-media': return state.call?.callType === 'video' ? 'Turning on camera…' : 'Turning on microphone…';
      case 'media-ready': return 'Camera ready';
      case 'fetching-token': return 'Securing the line…';
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
      setIsMinimized(false);
      setShowHeader(true);
      setShowFooter(true);
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      setHasRemoteParticipant(false);
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
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
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
                    <Avatar className={`h-32 w-32 sm:h-40 sm:w-40 ring-4 ring-white/10 shadow-2xl transition-opacity duration-500 ${remoteUserLeft ? 'opacity-80' : ''}`}>
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-4xl sm:text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                    </Avatar>
                  </motion.div>
                </div>
                <h2 className="mt-4 sm:mt-6 text-xl sm:text-2xl font-bold text-white tracking-tight">{displayName}</h2>
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
          <div className="absolute top-0 left-0 right-0 h-24 z-50 pointer-events-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }} onMouseEnter={handleHeaderAreaEnter} onMouseLeave={handleHeaderAreaLeave} onTouchStart={showControlsTemporarily}>
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
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onMouseEnter={handleFooterAreaEnter}
            onMouseLeave={handleFooterAreaLeave}
            onTouchStart={handleFooterAreaEnter}
          >
            <div className="flex flex-col items-center gap-2 px-3">
              {/* Secondary row (smaller) */}
              <div className="inline-flex items-center gap-2 p-1.5 rounded-2xl backdrop-blur-xl bg-black/20 border border-white/[0.05]">
                {/* Settings */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { triggerHaptic('light'); setSettingsOpen(true); }} className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex-shrink-0 flex items-center justify-center transition-all", "bg-white/10 text-white/70 hover:bg-white/20")}>
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
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { triggerHaptic('medium'); handleToggleMute(); }} disabled={!isConnected} className={cn("relative h-11 w-11 sm:h-14 sm:w-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isMuted ? "bg-white text-black shadow-lg ring-2 ring-primary/50" : "bg-white/10 text-white hover:bg-white/20")}>
                  {isMuted ? <MicOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Mic className="h-5 w-5 sm:h-6 sm:w-6" />}
                </motion.button>

                {/* Video toggle — available on audio calls too (enables camera mid-call) */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { triggerHaptic('medium'); handleToggleVideo(); }} disabled={!isConnected} className={cn("relative h-11 w-11 sm:h-14 sm:w-14 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isVideoOff ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-black shadow-lg ring-2 ring-accent/50")} title={isVideoOff ? "Turn camera on" : "Turn camera off"}>
                  {isVideoOff ? <VideoOff className="h-5 w-5 sm:h-6 sm:w-6" /> : <Video className="h-5 w-5 sm:h-6 sm:w-6" />}
                </motion.button>

                <div className="w-px h-8 sm:h-10 bg-white/20 flex-shrink-0" />

                {/* End Call — Wide red pill (2x width) */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { triggerHaptic('heavy'); currentMode === 'persistent' ? handleLeaveCall() : handleHangup(); }}
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

      {/* Incoming call dialog */}
      <AnimatePresence>
        {isRinging && state.call && (
          <motion.div key={`incoming-${state.call.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100000] flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(280 20% 8%) 50%, hsl(240 10% 6%) 100%)', isolation: 'isolate' }}>
            <IncomingCallDialog call={state.call} onAccept={handleAccept} onDecline={dismissIncoming} />
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Paywall Sheet for non-premium users */}
      <PaywallSheet open={showPaywall} onOpenChange={setShowPaywall} />
    </>
  );
}

// ── Incoming Call Dialog ────────────────────────────────────

function IncomingCallDialog({ call, onAccept, onDecline }: { call: CallData; onAccept: () => void; onDecline: () => void }) {
  const [timeLeft, setTimeLeft] = useState(INCOMING_CALL_TIMEOUT_SECONDS);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const isVideoCall = call.callType === 'video';
  const caller = call.caller;
  const isGroupCall = call.isGroupCall;
  const groupName = call.groupName;
  const groupAvatar = call.groupAvatar;
  const incomingDisplayName = isGroupCall && groupName ? groupName : (caller?.display_name || caller?.username);
  const incomingDisplayAvatar = isGroupCall ? groupAvatar : caller?.avatar_url;
  const incomingDisplayInitial = isGroupCall && groupName ? groupName.charAt(0) : (caller?.display_name?.charAt(0) || caller?.username?.charAt(0));

  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { onDeclineRef.current(); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    onAccept();
  };

  const handleDecline = () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    callSounds.end();
    onDecline();
  };

  return (
    <>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
        <motion.div animate={{ x: [0, -30, 0], y: [0, -50, 0], scale: [1, 1.3, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }} />
      </div>
      <div className="absolute inset-0 backdrop-blur-3xl" />
      <motion.div initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 40 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative z-10 flex flex-col items-center max-w-sm w-full px-4">
        <div className="relative mb-6 sm:mb-8">
          <motion.div animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="absolute inset-0 rounded-full border-2 border-primary/50" style={{ width: 120, height: 120, margin: '-8px' }} />
          <motion.div animate={{ scale: [1, 1.4], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "linear" }} className="absolute inset-0 rounded-full border-2 border-accent/40" style={{ width: 120, height: 120, margin: '-8px' }} />
          <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }}>
            <Avatar className="h-24 w-24 sm:h-32 sm:w-32 ring-4 ring-white/10 shadow-2xl">
              <AvatarImage src={incomingDisplayAvatar || undefined} />
              <AvatarFallback className="text-3xl sm:text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{incomingDisplayInitial}</AvatarFallback>
            </Avatar>
          </motion.div>
          <motion.div initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.2, type: "spring" }} className="absolute -bottom-3 left-1/2 -translate-x-1/2">
            <div className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-primary to-accent flex items-center gap-1.5 shadow-lg">
              {isVideoCall ? <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" /> : <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />}
              <span className="text-[10px] sm:text-xs font-semibold text-white">
                {isGroupCall ? (isVideoCall ? 'Group FaceTime' : 'Group Call') : (isVideoCall ? 'FaceTime' : 'Audio Call')}
              </span>
            </div>
          </motion.div>
        </div>
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{incomingDisplayName}</h2>
          <motion.p className="text-white/60 text-base sm:text-lg" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
            {isGroupCall ? `${caller?.display_name || caller?.username} is calling...` : 'is calling you...'}
          </motion.p>
        </div>
        {/* Slide to Answer */}
        <div className="w-full px-6 mb-6 sm:mb-8">
          <SlideToAnswer
            isVideoCall={isVideoCall}
            onAccept={handleAccept}
            onDecline={handleDecline}
            disabled={isProcessing}
          />
        </div>
        <div className="flex items-center gap-2 text-white/30 text-xs sm:text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          <span>Auto-declining in {timeLeft}s</span>
        </div>
      </motion.div>
    </>
  );
}
