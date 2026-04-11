/**
 * Global Call Overlay — LiveKit Edition
 * 
 * Mounted ONCE at app root. Uses LiveKit client SDK for:
 * - Full custom video/audio rendering
 * - Built-in reconnection (network drops, app sleep)
 * - Glassmorphic modern design
 * - Call settings with mic/camera controls
 * - Room-based architecture with rejoin support
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, SlidersHorizontal, RefreshCw, Minimize2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { premiumSounds } from '@/lib/premiumSounds';
import { supabase } from '@/integrations/supabase/client';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  LocalTrackPublication,
  ConnectionState,
  DisconnectReason,
  VideoPresets,
} from 'livekit-client';
import { CallSettingsSheet } from './CallSettingsSheet';
import { MinimizedCallBubble } from './MinimizedCallBubble';

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, leaveCall, setPhase, setError, dismissIncoming } = useCallStore();
  
  // LiveKit Room ref
  const roomRef = useRef<Room | null>(null);
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
  
  // Remote user left — linger state
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

  // Attach a remote video track to the video element
  const attachRemoteVideo = useCallback((track: MediaStreamTrack) => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    setHasRemoteVideo(true);
  }, []);

  // Attach a remote audio track
  const attachRemoteAudio = useCallback((track: MediaStreamTrack) => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.muted = false;
    el.volume = 1;
    el.play().catch(() => {});
  }, []);

  // Attach local video track
  const attachLocalVideo = useCallback((track: MediaStreamTrack) => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    setHasLocalVideo(true);
  }, []);

  // Create and connect LiveKit Room
  const connectToRoom = useCallback(async (call: CallData) => {
    if (roomRef.current) {
      // If already connected to same room, skip
      if (roomRef.current.name === call.roomName && roomRef.current.state === ConnectionState.Connected) {
        if (import.meta.env.DEV) console.log('[CallOverlay] Already connected to room');
        return;
      }
      // Disconnect from previous room
      try { await roomRef.current.disconnect(); } catch {}
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    roomRef.current = room;

    // ---- EVENT LISTENERS ----

    // Track subscribed — remote participant's track is ready
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (import.meta.env.DEV) console.log('[CallOverlay] TrackSubscribed:', track.kind, participant.identity);
      
      if (track.kind === Track.Kind.Video) {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack) attachRemoteVideo(mediaTrack);
      } else if (track.kind === Track.Kind.Audio) {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack) attachRemoteAudio(mediaTrack);
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

    // Local track published
    room.on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      if (publication.kind === Track.Kind.Video) {
        const mediaTrack = publication.track?.mediaStreamTrack;
        if (mediaTrack) attachLocalVideo(mediaTrack);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      if (publication.kind === Track.Kind.Video) {
        setHasLocalVideo(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      }
    });

    // Participant connected
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      if (import.meta.env.DEV) console.log('[CallOverlay] ParticipantConnected:', participant.identity);
      setHasRemoteParticipant(true);

      // Cancel auto-end timer
      setRemoteUserLeft(false);
      setAutoEndCountdown(0);
      if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    });

    // Participant disconnected
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (import.meta.env.DEV) console.log('[CallOverlay] ParticipantDisconnected:', participant.identity);
      setHasRemoteParticipant(false);
      setHasRemoteVideo(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      // Start linger countdown
      const isGroupCall = stateRef.current.call?.isGroupCall;
      const LINGER_SECONDS = isGroupCall ? 60 * 60 : 30;
      setRemoteUserLeft(true);
      setAutoEndCountdown(LINGER_SECONDS);

      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setAutoEndCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = setTimeout(() => {
        if (import.meta.env.DEV) console.log(`[CallOverlay] Auto-ending after ${LINGER_SECONDS}s linger`);
        endCall();
      }, LINGER_SECONDS * 1000);
    });

    // Reconnection events — LiveKit handles this automatically
    room.on(RoomEvent.Reconnecting, () => {
      if (import.meta.env.DEV) console.log('[CallOverlay] Reconnecting...');
      setIsReconnecting(true);
    });

    room.on(RoomEvent.Reconnected, () => {
      if (import.meta.env.DEV) console.log('[CallOverlay] Reconnected!');
      setIsReconnecting(false);
    });

    // Disconnected
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (import.meta.env.DEV) console.log('[CallOverlay] Disconnected, reason:', reason);
      clearJoinTimeout();
      setIsReconnecting(false);

      // If we're leaving intentionally, don't do anything
      if (isLeavingRef.current) return;

      // If the call is still active in state, it means unexpected disconnect
      if (stateRef.current.phase === 'connected' || stateRef.current.phase === 'joining') {
        toast.error('Call disconnected');
        endCall();
      }
    });

    // Connected
    room.on(RoomEvent.Connected, () => {
      if (import.meta.env.DEV) console.log('[CallOverlay] Connected to room');
      clearJoinTimeout();
      premiumSounds.stopAllCallSounds();
      premiumSounds.callConnect();
      setPhase('connected');

      // Check for existing participants
      const remotes = Array.from(room.remoteParticipants.values());
      if (remotes.length > 0) {
        setHasRemoteParticipant(true);
        // Attach existing tracks
        remotes.forEach(p => {
          p.trackPublications.forEach(pub => {
            if (pub.track && pub.isSubscribed) {
              const mediaTrack = pub.track.mediaStreamTrack;
              if (pub.kind === Track.Kind.Video && mediaTrack) {
                attachRemoteVideo(mediaTrack);
              } else if (pub.kind === Track.Kind.Audio && mediaTrack) {
                attachRemoteAudio(mediaTrack);
              }
            }
          });
        });
      }
    });

    // ---- CONNECT ----
    try {
      if (import.meta.env.DEV) console.log('[CallOverlay] Connecting to LiveKit:', call.livekitUrl, 'room:', call.roomName);

      await room.connect(call.livekitUrl, call.token);

      // Publish local tracks based on call type
      await room.localParticipant.setMicrophoneEnabled(true);
      if (call.callType === 'video') {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (err: any) {
          console.warn('[CallOverlay] Camera enable failed:', err);
          setCameraError(err.message || 'Camera failed');
        }
      }

      if (import.meta.env.DEV) console.log('[CallOverlay] Connected and publishing');
    } catch (err: any) {
      console.error('[CallOverlay] Connect failed:', err);
      toast.error('Failed to connect');
      endCall();
    }
  }, [attachRemoteVideo, attachRemoteAudio, attachLocalVideo, clearJoinTimeout, endCall, setPhase]);

  // Join room when phase becomes 'joining'
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.token || !state.call?.livekitUrl) return;
    if (isLeavingRef.current) return;

    premiumSounds.stopAllCallSounds();

    let cancelled = false;

    const doJoin = async () => {
      // Request permissions first
      try {
        await requestCallMediaPermissions(state.call!.callType);
      } catch (err: any) {
        toast.error(err.message || 'Microphone permission required');
        endCall();
        return;
      }

      if (cancelled) return;

      // Set 30 second join timeout
      clearJoinTimeout();
      joinTimeoutRef.current = setTimeout(() => {
        if (stateRef.current.phase === 'joining') {
          toast.error('Call failed to connect');
          endCall();
        }
      }, 30000);

      await connectToRoom(state.call!);
    };

    doJoin();

    return () => { cancelled = true; clearJoinTimeout(); };
  }, [state.phase, state.call?.token, state.call?.livekitUrl, clearJoinTimeout, endCall, connectToRoom]);

  // Force cleanup when state resets to idle
  useEffect(() => {
    if (state.phase !== 'idle') return;
    const room = roomRef.current;
    if (room && room.state !== ConnectionState.Disconnected) {
      room.disconnect();
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
    const room = roomRef.current;
    if (!room) return;

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        await new Promise(r => setTimeout(r, 300));
        if (room.state === ConnectionState.Connected) {
          // Ensure audio element is playing
          if (remoteAudioRef.current?.srcObject) {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.play().catch(() => {});
          }
          if (remoteVideoRef.current?.srcObject) {
            remoteVideoRef.current.play().catch(() => {});
          }
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

  // LEAVE CALL — disconnect from room but don't end in DB
  const handleLeaveCall = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    isLeavingRef.current = true;

    setCameraError(null);
    setRemoteUserLeft(false);
    setAutoEndCountdown(0);
    if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    const room = roomRef.current;
    if (room) {
      try { await room.disconnect(); } catch {}
      roomRef.current = null;
    }

    leaveCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, leaveCall]);

  // HANGUP — fully end the call
  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    isLeavingRef.current = true;

    setCameraError(null);
    setRemoteUserLeft(false);
    setAutoEndCountdown(0);
    if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    const room = roomRef.current;
    if (room) {
      try { await room.disconnect(); } catch {}
      roomRef.current = null;
    }

    await endCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, endCall]);

  // Toggle mute
  const handleToggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || state.phase !== 'connected') return;
    const newMuted = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted, state.phase]);

  // Toggle video
  const handleToggleVideo = useCallback(async () => {
    const room = roomRef.current;
    if (!room || state.phase !== 'connected' || state.call?.callType !== 'video') return;
    try {
      const newOff = !isVideoOff;
      await room.localParticipant.setCameraEnabled(!newOff);
      setIsVideoOff(newOff);
      setCameraError(null);
    } catch (err: any) {
      setCameraError(err.message || 'Failed to toggle camera');
    }
  }, [state.phase, state.call?.callType, isVideoOff]);

  // Retry video
  const handleRetryVideo = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    setCameraError(null);
    try {
      await room.localParticipant.setCameraEnabled(true);
      setIsVideoOff(false);
    } catch (err: any) {
      setCameraError(err.message || 'Camera failed');
    }
  }, []);

  // Device changes
  const handleMicChange = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      setCurrentMicId(deviceId);
      toast.success('Microphone changed');
    } catch (err) {
      toast.error('Failed to change microphone');
    }
  }, []);

  const handleCameraChange = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice('videoinput', deviceId);
      setCurrentCameraId(deviceId);
      toast.success('Camera changed');
    } catch (err) {
      toast.error('Failed to change camera');
    }
  }, []);

  const handleSpeakerChange = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
      setCurrentSpeakerId(deviceId);
      toast.success('Speaker changed');
    } catch (err) {
      toast.error('Failed to change speaker');
    }
  }, []);

  // Accept incoming call
  const handleAccept = useCallback(async () => {
    if (!state.call) return;
    try {
      await requestCallMediaPermissions(state.call.callType);
    } catch (err: any) {
      toast.error(err.message || 'Microphone permission required');
      return;
    }
    acceptCall(state.call);
  }, [state.call, acceptCall]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
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
  
  const isVisible = state.phase !== 'idle';
  const isRinging = state.phase === 'ringing' && !state.call?.isInitiator;
  const isConnected = state.phase === 'connected';
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

  const handleHeaderAreaEnter = useCallback(() => {
    if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    setShowHeader(true);
  }, []);
  const handleHeaderAreaLeave = useCallback(() => {
    if (isConnected) headerTimeoutRef.current = setTimeout(() => setShowHeader(false), 1500);
  }, [isConnected]);
  const handleFooterAreaEnter = useCallback(() => {
    if (footerTimeoutRef.current) clearTimeout(footerTimeoutRef.current);
    setShowFooter(true);
  }, []);
  const handleFooterAreaLeave = useCallback(() => {
    if (isConnected) footerTimeoutRef.current = setTimeout(() => setShowFooter(false), 1500);
  }, [isConnected]);
  const handleScreenTap = useCallback(() => {
    setShowHeader(true);
    setShowFooter(true);
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
        <audio 
          ref={remoteAudioRef} 
          autoPlay 
          playsInline
          style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1 }}
        />
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
            background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(240 10% 8%) 50%, hsl(280 20% 8%) 100%)'
          }}
        >
          {/* Subtle background */}
          <div 
            className="absolute inset-0 overflow-hidden pointer-events-none opacity-20"
            style={{
              background: 'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, hsl(var(--accent) / 0.3) 0%, transparent 50%)'
            }}
          />

          {/* Reconnecting banner */}
          <AnimatePresence>
            {isReconnecting && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-4 right-4 z-50"
              >
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
              {/* Remote Video — Full Screen */}
              <div className="absolute inset-0" onClick={handleScreenTap}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-200",
                    hasRemoteVideo ? "opacity-100" : "opacity-0"
                  )}
                  style={{ willChange: 'auto', transform: 'translateZ(0)' }}
                />
                {!hasRemoteVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative text-center">
                      <div className="animate-pulse">
                        <Avatar className="h-40 w-40 ring-4 ring-white/10 shadow-2xl">
                          <AvatarImage src={displayAvatar || undefined} />
                          <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                            {displayInitial}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      {isRingingOut && <p className="mt-6 text-white/60 text-lg font-light animate-pulse">Ringing...</p>}
                      {!isConnected && !isRingingOut && <p className="mt-6 text-white/60 text-lg font-light animate-pulse">Waiting for video...</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Local Video — PiP */}
              {hasLocalVideo && !isVideoOff && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute top-24 right-4 w-32 h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 z-30"
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1) translateZ(0)' }}
                  />
                </motion.div>
              )}

              {/* Camera error */}
              {cameraError && isConnected && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-32 left-4 right-4 flex justify-center z-20"
                >
                  <div className="bg-red-500/20 backdrop-blur-lg border border-red-500/30 rounded-xl p-4 flex items-center gap-3 max-w-sm">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">Camera Issue</p>
                      <p className="text-white/70 text-xs">{cameraError}</p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRetryVideo}
                      className="h-10 px-4 rounded-lg bg-white/20 text-white flex items-center gap-2 hover:bg-white/30"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span className="text-sm">Retry</span>
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
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
                  <Avatar className="h-40 w-40 mx-auto ring-4 ring-white/10 shadow-2xl">
                    <AvatarImage src={displayAvatar || undefined} />
                    <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                      {displayInitial}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <h2 className="mt-6 text-2xl font-bold text-white">{displayName}</h2>
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
                    <p className="text-white/70 text-lg font-mono mt-1">
                      {Math.floor(autoEndCountdown / 60)}:{(autoEndCountdown % 60).toString().padStart(2, '0')}
                    </p>
                    <p className="text-white/40 text-xs mt-1">They can rejoin</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div 
            className="absolute top-0 left-0 right-0 h-24 z-50 pointer-events-auto"
            onMouseEnter={handleHeaderAreaEnter}
            onMouseLeave={handleHeaderAreaLeave}
          >
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: showHeader ? 0 : -100, opacity: showHeader ? 1 : 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="pointer-events-auto"
            >
              <div className="mx-4 mt-4 p-4 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12 ring-2 ring-white/20 shadow-lg">
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">{displayInitial}</AvatarFallback>
                      </Avatar>
                      {isConnected && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black/50" />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-lg">{displayName}</p>
                      <div className="flex items-center gap-2">
                        {isConnecting && !isRingingOut && (
                          <motion.div className="flex items-center gap-2 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                            <span className="text-sm">Connecting</span>
                          </motion.div>
                        )}
                        {isRingingOut && (
                          <motion.div className="flex items-center gap-2 text-white/60" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
                            </span>
                            <span className="text-sm">Ringing</span>
                          </motion.div>
                        )}
                        {isConnected && !isRingingOut && (
                          <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-white/70 text-sm font-mono tracking-wide">{formatDuration(callDuration)}</span>
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
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleMinimize}
                      className="h-9 w-9 rounded-full bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                      title="Minimize call"
                    >
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              >
                <div className="text-center">
                  <div className="relative">
                    <motion.div animate={{ scale: [1, 2], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }} className="absolute inset-0 rounded-full border-2 border-primary/50" style={{ width: 140, height: 140, margin: 'auto', left: 0, right: 0, top: 0, bottom: 0 }} />
                    <Avatar className="h-32 w-32 mx-auto ring-4 ring-primary/20 shadow-2xl">
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">{displayInitial}</AvatarFallback>
                    </Avatar>
                  </div>
                  <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-6 text-white/60 text-lg font-light">
                    Connecting to {displayName}...
                  </motion.p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Remote user left banner */}
          <AnimatePresence>
            {remoteUserLeft && isConnected && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-32 left-4 right-4 z-50"
              >
                <div className="p-4 rounded-2xl backdrop-blur-xl bg-primary/20 border border-primary/30 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">Call still live</p>
                      <p className="text-white/60 text-xs">
                        {displayName} left · They can rejoin · Auto-ends in {Math.floor(autoEndCountdown / 60)}:{(autoEndCountdown % 60).toString().padStart(2, '0')}
                      </p>
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
              <div className="inline-flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/10 shadow-2xl">
                {/* Settings */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSettingsOpen(true)}
                  disabled={!isConnected}
                  className={cn(
                    "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                    "bg-white/10 text-white hover:bg-white/20 border border-white/10",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <SlidersHorizontal className="h-5 w-5" />
                </motion.button>

                <div className="w-px h-10 bg-white/20 mx-1" />

                {/* Mute */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleToggleMute}
                  disabled={!isConnected}
                  className={cn(
                    "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    isMuted ? "bg-white text-black shadow-lg ring-2 ring-primary/50" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </motion.button>

                {/* Video toggle */}
                {isVideoCall && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleToggleVideo}
                    disabled={!isConnected}
                    className={cn(
                      "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      isVideoOff ? "bg-white text-black shadow-lg ring-2 ring-accent/50" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </motion.button>
                )}

                {/* Retry camera */}
                {isVideoCall && cameraError && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRetryVideo}
                    className="relative h-14 w-14 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/10"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </motion.button>
                )}

                <div className="w-px h-10 bg-white/20 mx-1" />

                {/* Leave */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLeaveCall}
                  disabled={isHangingUp}
                  className={cn(
                    "relative h-14 px-6 rounded-xl flex items-center justify-center gap-2 transition-all duration-300",
                    "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg",
                    "hover:from-red-600 hover:to-red-700",
                    "disabled:opacity-70"
                  )}
                >
                  {isHangingUp ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <PhoneOff className="h-5 w-5" />
                      <span className="font-medium">Leave</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Incoming call dialog */}
      <AnimatePresence>
        {isRinging && state.call && (
          <motion.div
            key={`incoming-${state.call.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            style={{
              background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(280 20% 8%) 50%, hsl(240 10% 6%) 100%)',
            }}
          >
            <IncomingCallDialog
              call={state.call}
              onAccept={handleAccept}
              onDecline={dismissIncoming}
            />
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
    </>
  );
}

// Incoming call dialog
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

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { onDecline(); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [onDecline]);

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
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
        <motion.div animate={{ x: [0, -30, 0], y: [0, -50, 0], scale: [1, 1.3, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }} />
      </div>
      <div className="absolute inset-0 backdrop-blur-3xl" />
      <motion.div
        initial={{ scale: 0.8, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative z-10 flex flex-col items-center max-w-sm w-full"
      >
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
