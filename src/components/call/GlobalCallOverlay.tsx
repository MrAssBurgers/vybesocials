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
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, SlidersHorizontal, RefreshCw, Minimize2, Crown, Zap } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData, CallMode } from '@/lib/callStore';
import { requestCallMediaPermissions } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { P2PConnection, P2PEvent } from '@/lib/p2pConnection';
import { PaywallSheet } from '@/components/premium/PaywallSheet';
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

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, leaveCall, setPhase, setError, dismissIncoming, switchMode } = useCallStore();
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
  const [isVideoOff, setIsVideoOff] = useState(false);
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

  const attachLocalVideo = useCallback((track: MediaStreamTrack) => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    setHasLocalVideo(true);
  }, []);

  // ── P2P Connection ────────────────────────────────────────

  const handleP2PEvent = useCallback((event: P2PEvent) => {
    switch (event.type) {
      case 'connected':
        clearJoinTimeout();
        premiumSounds.stopAllCallSounds();
        premiumSounds.callConnect();
        setPhase('connected');
        setIsReconnecting(false);
        setP2pFailCount(0);
        p2pEndedRef.current = false;
        break;

      case 'disconnected':
        if (!isLeavingRef.current && !p2pEndedRef.current) {
          // P2P has no linger — if remote hangs up, end call
          if (event.reason === 'remote-hangup') {
            p2pEndedRef.current = true;
            toast.info('Call ended');
            endCall();
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
        // Don't call endCall here — 'disconnected' with reason 'remote-hangup' handles it
        // This prevents double endCall firing
        break;

      case 'ice-failed':
        setP2pFailCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            toast.error('Connection unstable. Try "Stay On Call" for a better experience.', { duration: 5000 });
          }
          return newCount;
        });
        break;
    }
  }, [clearJoinTimeout, endCall, setPhase, attachRemoteVideo, attachRemoteAudio]);

  // Keep P2P event handler fresh to avoid stale closures
  const handleP2PEventRef = useRef(handleP2PEvent);
  useEffect(() => {
    handleP2PEventRef.current = handleP2PEvent;
    // Update the handler on an existing P2P connection
    if (p2pRef.current) {
      p2pRef.current.setOnEvent(handleP2PEvent);
    }
  }, [handleP2PEvent]);

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
    });

    p2pRef.current = p2p;

    try {
      await p2p.connect();

      // Attach local video if video call
      const localStream = p2p.getLocalStream();
      if (localStream && call.callType === 'video') {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) attachLocalVideo(videoTrack);
      }

      if (import.meta.env.DEV) console.log('[CallOverlay] P2P connection initiated');
    } catch (err: any) {
      console.error('[CallOverlay] P2P connect failed:', err);
      toast.error('Failed to connect');
      endCall();
    }
  }, [profile?.id, attachLocalVideo, endCall]);

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
      const LINGER_SECONDS = isGroupCall ? 60 * 60 : 30;
      setRemoteUserLeft(true);
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
      await room.connect(call.livekitUrl, call.token);
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
  }, [attachRemoteVideo, attachRemoteAudio, attachLocalVideo, clearJoinTimeout, endCall, setPhase]);

  // ── Join/Switch Logic ─────────────────────────────────────

  // Handle joining (phase === 'joining')
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call) return;
    if (isLeavingRef.current) return;

    premiumSounds.stopAllCallSounds();
    let cancelled = false;

    const doJoin = async () => {
      try {
        await requestCallMediaPermissions(state.call!.callType);
      } catch (err: any) {
        toast.error(err.message || 'Microphone permission required');
        endCall();
        return;
      }
      if (cancelled) return;

      clearJoinTimeout();
      joinTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.phase === 'joining') {
          toast.error('Call failed to connect');
          endCall();
        }
      }, 30000);

      if (state.call!.callMode === 'persistent') {
        await connectToRoom(state.call!);
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

  // Visibility change — resume media when returning from background
  useEffect(() => {
    if (state.phase !== 'connected') return;

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
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.phase === 'connected' || state.phase === 'joining') {
        e.preventDefault();
        e.returnValue = 'You have an active call. Are you sure you want to leave?';
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.phase]);

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
    if (state.phase !== 'connected' || state.call?.callType !== 'video') return;
    try {
      const newOff = !isVideoOff;
      if (state.call?.callMode === 'persistent' && roomRef.current) {
        await roomRef.current.localParticipant.setCameraEnabled(!newOff);
      } else if (p2pRef.current) {
        await p2pRef.current.setCameraEnabled(!newOff);
      }
      setIsVideoOff(newOff);
      setCameraError(null);
    } catch (err: any) {
      setCameraError(err.message || 'Failed to toggle camera');
    }
  }, [state.phase, state.call?.callType, state.call?.callMode, isVideoOff]);

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
    try {
      await requestCallMediaPermissions(state.call.callType);
    } catch (err: any) {
      toast.error(err.message || 'Microphone permission required');
      return;
    }
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
      setIsVideoOff(false);
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

  const handleHeaderAreaEnter = useCallback(() => { if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current); setShowHeader(true); }, []);
  const handleHeaderAreaLeave = useCallback(() => { if (isConnected) headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 1500); }, [isConnected]);
  const handleFooterAreaEnter = useCallback(() => { if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current); setShowFooter(true); }, []);
  const handleFooterAreaLeave = useCallback(() => { if (isConnected) footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 1500); }, [isConnected]);
  const handleScreenTap = useCallback(() => {
    setShowHeader(true); setShowFooter(true);
    if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current);
    if (isConnected) {
      headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 3000);
      footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 3000);
    }
  }, [isConnected]);

  return (
    <>
      {/* Audio element — always mounted during active call */}
      {isVisible && !isRinging && (
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1 }} />
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
          className="fixed inset-0 z-[9999] transition-opacity duration-300"
          style={{
            opacity: isMinimized ? 0 : 1,
            pointerEvents: isMinimized ? 'none' : 'auto',
            visibility: isMinimized ? 'hidden' : 'visible',
            background: 'linear-gradient(160deg, #0a0a12 0%, #0d0b1a 25%, #12091f 50%, #0e0a1e 75%, #080810 100%)'
          }}
        >
          {/* Animated ambient blobs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0], scale: [1, 1.3, 0.9, 1] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.15]"
              style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0], scale: [1, 1.2, 1.1, 1] }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-32 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.12]"
              style={{ background: 'radial-gradient(circle, hsl(280 80% 60%) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ x: [0, 30, -30, 0], y: [0, -40, 30, 0] }}
              transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
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

          {/* Video Container */}
          {isVideoCall && (
            <>
              <div className="absolute inset-0" onClick={handleScreenTap}>
                <video ref={remoteVideoRef} autoPlay playsInline muted className={cn("w-full h-full object-cover transition-opacity duration-200", hasRemoteVideo ? "opacity-100" : "opacity-0")} style={{ willChange: 'auto', transform: 'translateZ(0)' }} />
                {!hasRemoteVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative text-center">
                      <div className="animate-pulse">
                        <Avatar className="h-40 w-40 ring-4 ring-white/10 shadow-2xl">
                          <AvatarImage src={displayAvatar || undefined} />
                          <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                        </Avatar>
                      </div>
                      {isRingingOut && <p className="mt-6 text-white/60 text-lg font-light animate-pulse">Ringing...</p>}
                      {!isConnected && !isRingingOut && <p className="mt-6 text-white/60 text-lg font-light animate-pulse">Waiting for video...</p>}
                    </div>
                  </div>
                )}
              </div>
              {hasLocalVideo && !isVideoOff && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="absolute top-24 right-4 w-32 h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 z-30">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1) translateZ(0)' }} />
                </motion.div>
              )}
              {cameraError && isConnected && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-32 left-4 right-4 flex justify-center z-20">
                  <div className="bg-red-500/20 backdrop-blur-lg border border-red-500/30 rounded-xl p-4 flex items-center gap-3 max-w-sm">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">Camera Issue</p>
                      <p className="text-white/70 text-xs">{cameraError}</p>
                    </div>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleRetryVideo} className="h-10 px-4 rounded-lg bg-white/20 text-white flex items-center gap-2 hover:bg-white/30">
                      <RefreshCw className="w-4 h-4" /><span className="text-sm">Retry</span>
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </>
          )}

          {/* Audio Call — Avatar */}
          {!isVideoCall && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                {/* Outer glow rings */}
                <div className="relative inline-block">
                  <motion.div
                    animate={{ scale: [1, 1.6], opacity: [0.3, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeOut" }}
                    className="absolute inset-0 rounded-full border border-primary/40"
                    style={{ width: 176, height: 176, margin: '-8px' }}
                  />
                  <motion.div
                    animate={{ scale: [1, 1.4], opacity: [0.2, 0] }}
                    transition={{ repeat: Infinity, duration: 3, delay: 0.8, ease: "easeOut" }}
                    className="absolute inset-0 rounded-full border border-accent/30"
                    style={{ width: 176, height: 176, margin: '-8px' }}
                  />
                  {/* Glowing backdrop behind avatar */}
                  <motion.div
                    animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.6, 0.4] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full blur-2xl"
                    style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(280 80% 60% / 0.3))', width: 160, height: 160 }}
                  />
                  <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
                    <Avatar className="h-40 w-40 mx-auto ring-4 ring-white/10 shadow-2xl relative z-10">
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                    </Avatar>
                  </motion.div>
                </div>
                <h2 className="mt-6 text-2xl font-bold text-white tracking-tight">{displayName}</h2>
                {isConnecting && (
                  <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-2 text-white/60 text-lg">Connecting...</motion.p>
                )}
                {isRingingOut && (
                  <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }} className="mt-2 text-white/60 text-lg">Ringing...</motion.p>
                )}
                {isConnected && !isRingingOut && !remoteUserLeft && (
                  <p className="mt-2 text-white/70 text-lg font-mono">{formatDuration(callDuration)}</p>
                )}
                {isConnected && remoteUserLeft && (
                  <div className="mt-4 text-center">
                    <p className="text-white/50 text-sm">{displayName} left the call</p>
                    <p className="text-white/70 text-lg font-mono mt-1">{Math.floor(autoEndCountdown / 60)}:{(autoEndCountdown % 60).toString().padStart(2, '0')}</p>
                    <p className="text-white/40 text-xs mt-1">They can rejoin</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div className="absolute top-0 left-0 right-0 h-24 z-50 pointer-events-auto" onMouseEnter={handleHeaderAreaEnter} onMouseLeave={handleHeaderAreaLeave}>
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: showHeader ? 0 : -100, opacity: showHeader ? 1 : 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="pointer-events-auto">
              <div className="mx-4 mt-4 p-4 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12 ring-2 ring-white/20 shadow-lg">
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">{displayInitial}</AvatarFallback>
                      </Avatar>
                      {isConnected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black/50" />}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-lg">{displayName}</p>
                      <div className="flex items-center gap-2">
                        {isConnecting && !isRingingOut && (
                          <motion.div className="flex items-center gap-2 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-primary" /></span>
                            <span className="text-sm">Connecting</span>
                          </motion.div>
                        )}
                        {isRingingOut && (
                          <motion.div className="flex items-center gap-2 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" /></span>
                            <span className="text-sm">Ringing</span>
                          </motion.div>
                        )}
                        {isConnected && !isRingingOut && (
                          <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-white/70 text-sm font-mono tracking-wide">{formatDuration(callDuration)}</span>
                            {/* Call mode indicator */}
                            {currentMode === 'persistent' && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/30">
                                <Crown className="h-3 w-3 text-primary" />
                                <span className="text-[10px] text-primary font-medium">Stay On</span>
                              </span>
                            )}
                          </div>
                        )}
                        {isReconnecting && (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-sm">Reconnecting</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
                      {isVideoCall ? <Video className="h-4 w-4 text-white/70" /> : <Phone className="h-4 w-4 text-white/70" />}
                    </div>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleMinimize} className="h-9 w-9 rounded-full bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" title="Minimize call">
                      <Minimize2 className="h-4 w-4 text-white/70" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Connecting overlay for receiver */}
          <AnimatePresence>
            {isConnecting && isVideoCall && !state.call?.isInitiator && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="text-center">
                  <div className="relative">
                    <motion.div animate={{ scale: [1, 2], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }} className="absolute inset-0 rounded-full border-2 border-primary/50" style={{ width: 140, height: 140, margin: 'auto', left: 0, right: 0, top: 0, bottom: 0 }} />
                    <Avatar className="h-32 w-32 mx-auto ring-4 ring-primary/20 shadow-2xl">
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                    </Avatar>
                  </div>
                  <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-6 text-white/60 text-lg font-light">Connecting to {displayName}...</motion.p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Remote user left banner (persistent mode only) */}
          <AnimatePresence>
            {remoteUserLeft && isConnected && currentMode === 'persistent' && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-32 left-4 right-4 z-50">
                <div className="p-4 rounded-2xl backdrop-blur-xl bg-primary/20 border border-primary/30 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">Call still live</p>
                      <p className="text-white/60 text-xs">{displayName} left · They can rejoin · Auto-ends in {Math.floor(autoEndCountdown / 60)}:{(autoEndCountdown % 60).toString().padStart(2, '0')}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer controls */}
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: showFooter ? 0 : 100, opacity: showFooter ? 1 : 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute bottom-0 left-0 right-0 pb-10 pointer-events-auto"
            onMouseEnter={handleFooterAreaEnter}
            onMouseLeave={handleFooterAreaLeave}
          >
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-3 p-3 rounded-[20px] backdrop-blur-2xl bg-black/40 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Settings */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSettingsOpen(true)} disabled={!isConnected} className={cn("relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300", "bg-white/10 text-white hover:bg-white/20 border border-white/10", "disabled:opacity-50 disabled:cursor-not-allowed")}>
                  <SlidersHorizontal className="h-5 w-5" />
                </motion.button>

                {/* Stay On Call toggle — premium feature */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStayOnCallToggle}
                  disabled={!isConnected || isSwitching}
                  className={cn(
                    "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    currentMode === 'persistent'
                      ? "bg-gradient-to-br from-primary to-accent text-white shadow-lg ring-2 ring-primary/50"
                      : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                  )}
                  title={currentMode === 'persistent' ? 'Stay On Call (active)' : 'Stay On Call (premium)'}
                >
                  <Crown className="h-5 w-5" />
                  {!isPremium && currentMode !== 'persistent' && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-black">PRO</span>
                    </span>
                  )}
                </motion.button>

                <div className="w-px h-10 bg-white/20 mx-1" />

                {/* Mute */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleToggleMute} disabled={!isConnected} className={cn("relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isMuted ? "bg-white text-black shadow-lg ring-2 ring-primary/50" : "bg-white/10 text-white hover:bg-white/20")}>
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </motion.button>

                {/* Video toggle */}
                {isVideoCall && (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleToggleVideo} disabled={!isConnected} className={cn("relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300", "disabled:opacity-50 disabled:cursor-not-allowed", isVideoOff ? "bg-white text-black shadow-lg ring-2 ring-accent/50" : "bg-white/10 text-white hover:bg-white/20")}>
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </motion.button>
                )}

                {/* Retry camera */}
                {isVideoCall && cameraError && (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleRetryVideo} className="relative h-14 w-14 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/10">
                    <RefreshCw className="h-5 w-5" />
                  </motion.button>
                )}

                <div className="w-px h-10 bg-white/20 mx-1" />

                {/* Leave / End */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={currentMode === 'persistent' ? handleLeaveCall : handleHangup} disabled={isHangingUp} className={cn("relative h-14 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300", "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg", "hover:from-red-600 hover:to-red-700", "disabled:opacity-70")}>
                  {isHangingUp ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><PhoneOff className="h-5 w-5" /><span className="font-medium">{currentMode === 'persistent' ? 'Leave' : 'End'}</span></>)}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Incoming call dialog */}
      <AnimatePresence>
        {isRinging && state.call && (
          <motion.div key={`incoming-${state.call.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(280 20% 8%) 50%, hsl(240 10% 6%) 100%)' }}>
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
  const [timeLeft, setTimeLeft] = useState(60);
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
        <motion.div animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
        <motion.div animate={{ x: [0, -30, 0], y: [0, -50, 0], scale: [1, 1.3, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }} />
      </div>
      <div className="absolute inset-0 backdrop-blur-3xl" />
      <motion.div initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 40 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative z-10 flex flex-col items-center max-w-sm w-full">
        <div className="relative mb-8">
          <motion.div animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }} className="absolute inset-0 rounded-full border-2 border-primary/50" style={{ width: 144, height: 144, margin: '-8px' }} />
          <motion.div animate={{ scale: [1, 1.4], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }} className="absolute inset-0 rounded-full border-2 border-accent/40" style={{ width: 144, height: 144, margin: '-8px' }} />
          <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
            <Avatar className="h-32 w-32 ring-4 ring-white/10 shadow-2xl">
              <AvatarImage src={incomingDisplayAvatar || undefined} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{incomingDisplayInitial}</AvatarFallback>
            </Avatar>
          </motion.div>
          <motion.div initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: 0.2, type: "spring" }} className="absolute -bottom-3 left-1/2 -translate-x-1/2">
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-accent flex items-center gap-1.5 shadow-lg">
              {isVideoCall ? <Video className="h-4 w-4 text-white" /> : <Phone className="h-4 w-4 text-white" />}
              <span className="text-xs font-semibold text-white">
                {isGroupCall ? (isVideoCall ? 'Group FaceTime' : 'Group Call') : (isVideoCall ? 'FaceTime' : 'Audio Call')}
              </span>
            </div>
          </motion.div>
        </div>
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">{incomingDisplayName}</h2>
          <motion.p className="text-white/60 text-lg" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
            {isGroupCall ? `${caller?.display_name || caller?.username} is calling...` : 'is calling you...'}
          </motion.p>
        </div>
        <div className="flex items-center justify-center gap-8 w-full mb-8">
          <div className="flex flex-col items-center gap-3">
            <button onClick={handleDecline} onTouchEnd={(e) => { e.preventDefault(); handleDecline(); }} disabled={isProcessing} className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg flex items-center justify-center hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90">
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-white/50 text-sm font-medium">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button onClick={handleAccept} onTouchEnd={(e) => { e.preventDefault(); handleAccept(); }} disabled={isProcessing} className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg flex items-center justify-center hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90 animate-pulse">
              {isVideoCall ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </button>
            <span className="text-white/50 text-sm font-medium">Accept</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          <span>Auto-declining in {timeLeft}s</span>
        </div>
      </motion.div>
    </>
  );
}
