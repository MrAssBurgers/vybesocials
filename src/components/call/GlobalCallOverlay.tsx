/**
 * Global Call Overlay
 * 
 * Mounted ONCE at app root. Uses Daily Call Object (custom UI) for:
 * - Full custom video/audio rendering
 * - No prebuilt Daily UI (no green Join button, no Goodbye screen)
 * - Glassmorphic modern design
 * - Call settings with mic/camera controls
 * - INSTANT camera loading like FaceTime
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Loader2, SlidersHorizontal, RefreshCw, Play } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCallStore, CallData } from '@/lib/callStore';
import { requestCallMediaPermissions, isAndroid, nextAnimationFrame } from '@/lib/mediaPermissions';
import { callSounds } from '@/lib/callSounds';
import { supabase } from '@/integrations/supabase/client';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { CallSettingsSheet } from './CallSettingsSheet';
import { useCameraPreload, stopPreloadedCamera, getPreloadedStream } from '@/hooks/useCameraPreload';

export function GlobalCallOverlay() {
  const { state, acceptCall, endCall, setPhase, setError, dismissIncoming } = useCallStore();
  
  // Daily call object ref
  const dailyRef = useRef<DailyCall | null>(null);
  
  const isLeavingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Video/Audio refs for attaching streams
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  
  // Local UI state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [remoteParticipant, setRemoteParticipant] = useState<DailyParticipant | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentMicId, setCurrentMicId] = useState<string | undefined>();
  const [currentCameraId, setCurrentCameraId] = useState<string | undefined>();
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | undefined>();
  
  // iOS/iPad autoplay handling - need user tap to start video
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isRetryingVideo, setIsRetryingVideo] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // INSTANT CAMERA: Preload camera for video calls - start as soon as call begins
  const isVideoCall = state.call?.callType === 'video';
  const isActiveCall = state.phase !== 'idle';
  const shouldPreloadCamera = isVideoCall && isActiveCall;
  
  // Use camera preload for instant video display
  const { stream: preloadedStream, isReady: cameraReady, attachToVideo } = useCameraPreload(shouldPreloadCamera);
  
  // Ref for preloaded video element
  const preloadVideoRef = useRef<HTMLVideoElement>(null);
  
  // Attach preloaded stream to video element when ready
  useEffect(() => {
    if (preloadVideoRef.current && preloadedStream && cameraReady) {
      preloadVideoRef.current.srcObject = preloadedStream;
      preloadVideoRef.current.play().catch(console.error);
      console.log('[CallOverlay] Preloaded camera attached to video element');
    }
  }, [preloadedStream, cameraReady]);

  // Track call data for stale closure prevention
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clear join timeout helper
  const clearJoinTimeout = useCallback(() => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, []);

  // Detect iOS/iPad for autoplay handling
  const isIOSorIPad = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  // Force enable video tracks - NON-NEGOTIABLE for video calls
  const forceEnableVideoTracks = useCallback(async (daily: DailyCall) => {
    if (!daily) return;
    
    const callType = stateRef.current.call?.callType;
    console.log('[CallOverlay] forceEnableVideoTracks called, callType:', callType);
    
    try {
      // Always enable audio first
      await daily.setLocalAudio(true);
      console.log('[CallOverlay] Audio enabled');
      
      if (callType === 'video') {
        // Force camera on
        console.log('[CallOverlay] Forcing camera on...');
        await daily.setLocalVideo(true);
        
        // Verify it actually enabled - retry if not
        setTimeout(async () => {
          try {
            const participants = daily.participants();
            const local = participants?.local;
            const videoTrack = local?.tracks?.video;
            
            console.log('[CallOverlay] Video track state after enable:', {
              hasVideo: local?.video,
              trackState: videoTrack?.state,
              hasTrack: !!videoTrack?.persistentTrack || !!videoTrack?.track
            });
            
            if (!local?.video || videoTrack?.state === 'off') {
              console.log('[CallOverlay] Video not enabled, retrying...');
              await daily.setLocalVideo(true);
              
              // Check again after second attempt
              setTimeout(async () => {
                const p2 = daily.participants()?.local;
                if (!p2?.video) {
                  console.error('[CallOverlay] Camera failed to enable after retries');
                  setCameraError('Camera could not be enabled. Check permissions.');
                }
              }, 500);
            }
          } catch (e) {
            console.error('[CallOverlay] Video verification failed:', e);
          }
        }, 300);
      } else {
        await daily.setLocalVideo(false);
      }
    } catch (err: any) {
      console.error('[CallOverlay] forceEnableVideoTracks error:', err);
      setCameraError(err.message || 'Failed to enable camera');
    }
  }, []);

  // Retry video - user-triggered
  const handleRetryVideo = useCallback(async () => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    setIsRetryingVideo(true);
    setCameraError(null);
    
    try {
      console.log('[CallOverlay] User-triggered video retry');
      await daily.setLocalVideo(false);
      await new Promise(r => setTimeout(r, 200));
      await daily.setLocalVideo(true);
      
      // Check result
      setTimeout(() => {
        const local = daily.participants()?.local;
        if (local?.video) {
          console.log('[CallOverlay] Video retry succeeded');
          setIsVideoOff(false);
        } else {
          setCameraError('Camera still not working. Check browser permissions.');
        }
        setIsRetryingVideo(false);
      }, 500);
    } catch (err: any) {
      console.error('[CallOverlay] Video retry failed:', err);
      setCameraError(err.message || 'Retry failed');
      setIsRetryingVideo(false);
    }
  }, []);

  // iOS tap-to-start handler
  const handleTapToStart = useCallback(async () => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    console.log('[CallOverlay] iOS tap-to-start triggered');
    setNeedsUserInteraction(false);
    
    try {
      // Re-enable video after user interaction
      await forceEnableVideoTracks(daily);
      
      // Try to play remote video
      if (remoteVideoRef.current) {
        await remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = false;
        await remoteAudioRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('[CallOverlay] Tap-to-start error:', err);
    }
  }, [forceEnableVideoTracks]);

  // Attach video track to element
  const attachTrack = useCallback((track: MediaStreamTrack, videoEl: HTMLVideoElement) => {
    try {
      const stream = new MediaStream([track]);
      videoEl.srcObject = stream;
      videoEl.play().catch(console.error);
    } catch (err) {
      console.error('[CallOverlay] Failed to attach track:', err);
    }
  }, []);

  // Create Daily call object lazily when needed
  const getOrCreateDaily = useCallback((): DailyCall => {
    if (dailyRef.current) return dailyRef.current;

    console.log('[CallOverlay] Creating Daily Call Object');
    
    const daily = DailyIframe.createCallObject({
      subscribeToTracksAutomatically: true,
    });

    dailyRef.current = daily;

    // Attach event listeners ONCE
    daily.on('joining-meeting', () => {
      console.log('[CallOverlay] 📞 joining-meeting event');
    });

    daily.on('joined-meeting', async () => {
      console.log('[CallOverlay] ✅ joined-meeting event');
      clearJoinTimeout();
      
      if (stateRef.current.phase !== 'joining') {
        console.log('[CallOverlay] Ignoring joined-meeting (not in joining phase)');
        return;
      }

      // CRITICAL: Force enable all media tracks immediately after joining
      await forceEnableVideoTracks(daily);

      // CRITICAL: Force-unmute remote audio element after joining (browser autoplay policy workaround)
      setTimeout(() => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.volume = 1;
          console.log('[CallOverlay] Force-unmuted remote audio element');
        }
      }, 100);

      // iOS/iPad: Check if we need user interaction for autoplay
      const isIOS = isIOSorIPad();
      if (isIOS && stateRef.current.call?.callType === 'video') {
        console.log('[CallOverlay] iOS detected - may need user tap for video');
        // Check if video actually started
        setTimeout(() => {
          const local = daily.participants()?.local;
          if (!local?.video && stateRef.current.call?.callType === 'video') {
            console.log('[CallOverlay] iOS video not started - showing tap overlay');
            setNeedsUserInteraction(true);
          }
        }, 1000);
      }

      callSounds.stopAll();
      callSounds.connect();
      setPhase('connected');
    });

    daily.on('left-meeting', () => {
      console.log('[CallOverlay] 👋 left-meeting event');
      clearJoinTimeout();
      isLeavingRef.current = false;
      setRemoteParticipant(null);
      setHasRemoteVideo(false);
      setHasLocalVideo(false);
    });

    daily.on('error', (event: any) => {
      console.error('[CallOverlay] ❌ error event:', event);
      clearJoinTimeout();
      
      const msg = event?.errorMsg || event?.error?.msg || 'Call error';
      toast.error(msg);
      setError(msg);
      endCall();
    });

    // Helper to attach remote participant video
    const attachRemoteParticipantVideo = (p: DailyParticipant, videoEl: HTMLVideoElement | null) => {
      if (!p || !videoEl) return;
      
      // Check multiple track access patterns for compatibility
      const videoTrack = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
      const trackState = p.tracks?.video?.state;
      const hasVideo = p.video && (trackState === 'playable' || trackState === 'loading');
      
      console.log('[CallOverlay] Checking remote video:', {
        hasVideo: p.video,
        trackState,
        hasTrack: !!videoTrack,
        participantId: p.session_id
      });
      
      if (hasVideo && videoTrack) {
        console.log('[CallOverlay] Attaching remote video track');
        try {
          const stream = new MediaStream([videoTrack]);
          videoEl.srcObject = stream;
          videoEl.play().catch(err => console.error('[CallOverlay] Remote video play failed:', err));
          setHasRemoteVideo(true);
        } catch (err) {
          console.error('[CallOverlay] Failed to attach remote video:', err);
        }
      }
    };

    // Track participants
    daily.on('participant-joined', (event: any) => {
      console.log('[CallOverlay] 👤 participant-joined:', event?.participant?.session_id);
      if (event?.participant && !event.participant.local) {
        setRemoteParticipant(event.participant);
        // Immediately try to attach video if available
        attachRemoteParticipantVideo(event.participant, remoteVideoRef.current);
      }
    });

    daily.on('participant-left', (event: any) => {
      console.log('[CallOverlay] 👤 participant-left:', event?.participant?.session_id);
      if (event?.participant && !event.participant.local) {
        setRemoteParticipant(null);
        setHasRemoteVideo(false);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    });

    daily.on('participant-updated', (event: any) => {
      if (!event?.participant) return;
      
      const p = event.participant;
      if (p.local) {
        // Update local video state
        const hasVideo = p.video && (p.tracks?.video?.state === 'playable' || p.tracks?.video?.state === 'loading');
        const videoTrack = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
        setHasLocalVideo(hasVideo && !!videoTrack);
        
        if (hasVideo && videoTrack && localVideoRef.current) {
          attachTrack(videoTrack, localVideoRef.current);
        }
      } else {
        // Update remote participant
        setRemoteParticipant(p);
        attachRemoteParticipantVideo(p, remoteVideoRef.current);
      }
    });

    // Track started - attach video AND audio
    daily.on('track-started', (event: any) => {
      if (!event?.participant || !event?.track) return;
      
      const { participant, track } = event;
      console.log('[CallOverlay] 🎬 track-started:', participant.local ? 'local' : 'remote', track.kind);
      
      if (track.kind === 'video') {
        if (participant.local && localVideoRef.current) {
          attachTrack(track, localVideoRef.current);
          setHasLocalVideo(true);
        } else if (!participant.local && remoteVideoRef.current) {
          attachTrack(track, remoteVideoRef.current);
          setHasRemoteVideo(true);
        }
      } else if (track.kind === 'audio' && !participant.local) {
        // Attach remote audio track to audio element - CRITICAL for hearing remote user
        console.log('[CallOverlay] 🔊 Attaching remote audio track');
        
        // Wait for audio ref to be available (may fire before component fully mounted)
        const attachAudio = () => {
          const audioEl = remoteAudioRef.current;
          if (!audioEl) {
            console.log('[CallOverlay] Audio ref not ready, retrying...');
            setTimeout(attachAudio, 100);
            return;
          }
          
          try {
            const stream = new MediaStream([track]);
            audioEl.srcObject = stream;
            audioEl.muted = false;
            audioEl.volume = 1;
            
            // Force play with retry logic
            const playWithRetry = async (attempts = 3) => {
              try {
                await audioEl.play();
                console.log('[CallOverlay] ✅ Remote audio playing successfully');
              } catch (err: any) {
                console.warn('[CallOverlay] Audio play failed, attempt remaining:', attempts - 1, err);
                if (attempts > 1) {
                  setTimeout(() => playWithRetry(attempts - 1), 200);
                }
              }
            };
            
            playWithRetry();
          } catch (err) {
            console.error('[CallOverlay] Failed to attach audio track:', err);
          }
        };
        
        attachAudio();
      }
    });

    daily.on('track-stopped', (event: any) => {
      if (!event?.participant || !event?.track) return;
      
      const { participant, track } = event;
      console.log('[CallOverlay] 🎬 track-stopped:', participant.local ? 'local' : 'remote', track.kind);
      
      if (track.kind === 'video') {
        if (participant.local) {
          setHasLocalVideo(false);
          if (localVideoRef.current) localVideoRef.current.srcObject = null;
        } else {
          setHasRemoteVideo(false);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        }
      } else if (track.kind === 'audio' && !participant.local && remoteAudioRef.current) {
        console.log('[CallOverlay] 🔇 Remote audio track stopped');
        remoteAudioRef.current.srcObject = null;
      }
    });

    return daily;
  }, [clearJoinTimeout, setPhase, setError, endCall, attachTrack, forceEnableVideoTracks, isIOSorIPad]);

  // Join room when phase becomes 'joining'
  useEffect(() => {
    if (state.phase !== 'joining' || !state.call?.roomUrl || !state.call?.roomName) return;
    if (isLeavingRef.current) return;

    let cancelled = false;

    const doJoin = async () => {
      // Create Daily call object lazily (only when actually joining)
      const daily = getOrCreateDaily();
      
      console.log('[CallOverlay] Starting join flow for:', state.call?.roomUrl);

      // PARALLEL: Request permissions AND fetch token at the same time for speed
      const [permissionResult, tokenResult] = await Promise.allSettled([
        requestCallMediaPermissions(state.call!.callType),
        supabase.functions.invoke('get-call-token', {
          body: {
            roomName: state.call!.roomName,
            callId: state.call!.id,
          },
        }),
      ]);

      // Check permission result
      if (permissionResult.status === 'rejected') {
        console.error('[CallOverlay] Permission denied:', permissionResult.reason);
        toast.error(permissionResult.reason?.message || 'Microphone permission required');
        endCall();
        return;
      }
      console.log('[CallOverlay] Permissions granted');

      // Check token result
      if (tokenResult.status === 'rejected') {
        console.error('[CallOverlay] Token fetch failed:', tokenResult.reason);
        toast.error('Failed to authenticate with call server');
        endCall();
        return;
      }

      const { data: tokenData, error: tokenError } = tokenResult.value;
      if (tokenError || !tokenData?.token) {
        const msg = tokenError?.message || tokenData?.error || 'No token returned from server';
        console.error('[CallOverlay] Token error:', msg);
        toast.error(msg);
        endCall();
        return;
      }

      const token = tokenData.token;
      console.log('[CallOverlay] Token received');

      if (cancelled) return;

      // Leave any previous room first
      try {
        const meetingState = daily.meetingState();
        if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
          console.log('[CallOverlay] Leaving previous room');
          await daily.leave();
        }
      } catch {
        // ignore
      }

      if (cancelled) return;

      // Set 15 second timeout for join
      clearJoinTimeout();
      joinTimeoutRef.current = setTimeout(() => {
        console.error('[CallOverlay] Join timeout - no joined-meeting in 15s');
        toast.error('Call failed to connect');
        endCall();
      }, 15000);

      // Join the room WITH token
      try {
        console.log('[CallOverlay] Calling daily.join() with token');
        await daily.join({ url: state.call!.roomUrl, token });
        console.log('[CallOverlay] daily.join() returned');
      } catch (err: any) {
        console.error('[CallOverlay] Join failed:', err);
        clearJoinTimeout();
        toast.error('Failed to connect to call');
        endCall();
      }
    };

    doJoin();

    return () => {
      cancelled = true;
      clearJoinTimeout();
    };
  }, [state.phase, state.call?.roomUrl, state.call?.roomName, state.call?.id, state.call?.callType, clearJoinTimeout, endCall, setError, getOrCreateDaily]);

  // If the call gets reset remotely while Daily is still joining/joined, force-leave the meeting
  // (prevents "instant crash" feel where UI disappears but the iframe is still in a meeting state).
  useEffect(() => {
    if (state.phase !== 'idle') return;
    const daily = dailyRef.current;
    if (!daily) return;

    try {
      const meetingState = daily.meetingState();
      if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
        console.log('[CallOverlay] State reset to idle while in meeting; forcing daily.leave()');
        clearJoinTimeout();
        daily.leave();
      }
    } catch {
      // ignore
    }
  }, [state.phase, clearJoinTimeout]);

  // Call duration timer
  useEffect(() => {
    if (state.phase !== 'connected') {
      setCallDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase]);

  // CRITICAL: Poll for remote participants after connection
  // This ensures we catch remote video even if events fire before refs are ready
  useEffect(() => {
    if (state.phase !== 'connected') return;
    
    const daily = dailyRef.current;
    if (!daily) return;

    let pollCount = 0;
    const maxPolls = 30; // Poll for up to 15 seconds (30 * 500ms)

    const checkRemoteParticipants = () => {
      try {
        const participants = daily.participants();
        
        Object.values(participants).forEach((p: any) => {
          if (!p.local) {
            console.log(`[CallOverlay] Poll #${pollCount + 1}: Found remote participant`, {
              session_id: p.session_id,
              hasVideo: p.video,
              trackState: p.tracks?.video?.state
            });
            
            setRemoteParticipant(p);
            
            // Try to attach video if available and we don't have it yet
            const videoTrack = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
            const trackState = p.tracks?.video?.state;
            const isPlayable = trackState === 'playable' || trackState === 'loading';
            
            if (p.video && videoTrack && isPlayable && remoteVideoRef.current) {
              console.log('[CallOverlay] Poll: Attaching remote video track');
              try {
                const stream = new MediaStream([videoTrack]);
                remoteVideoRef.current.srcObject = stream;
                remoteVideoRef.current.play().catch(err => {
                  console.error('[CallOverlay] Poll: Remote video play error:', err);
                });
                setHasRemoteVideo(true);
              } catch (err) {
                console.error('[CallOverlay] Poll: Failed to attach video:', err);
              }
            }
            
            // Also check for audio - CRITICAL: ensure audio is always attached and playing
            const audioTrack = p.tracks?.audio?.persistentTrack || p.tracks?.audio?.track;
            const audioState = p.tracks?.audio?.state;
            const isAudioPlayable = audioState === 'playable' || audioState === 'loading';
            
            if (p.audio && audioTrack && isAudioPlayable && remoteAudioRef.current) {
              // Always try to attach audio, even if already attached (ensures it's playing)
              console.log('[CallOverlay] Poll: Attaching/refreshing remote audio track');
              try {
                const audioStream = new MediaStream([audioTrack]);
                remoteAudioRef.current.srcObject = audioStream;
                remoteAudioRef.current.muted = false;
                remoteAudioRef.current.volume = 1;
                remoteAudioRef.current.play().catch(err => {
                  console.warn('[CallOverlay] Poll: Audio play error:', err);
                });
              } catch (err) {
                console.error('[CallOverlay] Poll: Failed to attach audio:', err);
              }
            }
          }
        });
      } catch (err) {
        console.error('[CallOverlay] Poll error:', err);
      }
      
      pollCount++;
    };

    // Immediate check
    checkRemoteParticipants();
    
    // Poll every 500ms
    const pollInterval = setInterval(() => {
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        console.log('[CallOverlay] Stopped polling after max attempts');
        return;
      }
      checkRemoteParticipants();
    }, 500);

    return () => clearInterval(pollInterval);
  }, [state.phase]);

  // Re-enable video tracks when returning from background/minimized state
  useEffect(() => {
    if (state.phase !== 'connected') return;
    if (state.call?.callType !== 'video') return;
    
    const daily = dailyRef.current;
    if (!daily) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[CallOverlay] Tab became visible, re-enabling video tracks');
        
        // Small delay to let the browser settle
        await new Promise(r => setTimeout(r, 300));
        
        // Re-enable video if it was on before
        if (!isVideoOff) {
          try {
            await daily.setLocalVideo(true);
            console.log('[CallOverlay] Video re-enabled after visibility change');
          } catch (err) {
            console.warn('[CallOverlay] Failed to re-enable video:', err);
          }
        }

        // Try to resume remote video/audio playback
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.phase, state.call?.callType, isVideoOff]);

  // HANGUP - must always work
  const handleHangup = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    console.log('[CallOverlay] Hangup pressed');

    clearJoinTimeout();
    isLeavingRef.current = true;

    // Stop preloaded camera
    stopPreloadedCamera();
    
    // Reset UI states
    setCameraError(null);
    setNeedsUserInteraction(false);

    // Call daily.leave() with 5-second timeout failsafe
    const daily = dailyRef.current;
    if (daily) {
      const leavePromise = (async () => {
        try {
          const meetingState = daily.meetingState();
          if (meetingState === 'joined-meeting' || meetingState === 'joining-meeting') {
            console.log('[CallOverlay] Calling daily.leave()');
            await daily.leave();
            console.log('[CallOverlay] daily.leave() completed');
          }
        } catch (err) {
          console.error('[CallOverlay] Error leaving:', err);
        }
      })();
      
      // Force timeout after 5 seconds - hangup MUST always work
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn('[CallOverlay] Hangup timeout - forcing cleanup');
          resolve();
        }, 5000);
      });
      
      await Promise.race([leavePromise, timeoutPromise]);
    }

    // Force cleanup 
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    
    await endCall();
    setIsHangingUp(false);
    isLeavingRef.current = false;
  }, [isHangingUp, clearJoinTimeout, endCall]);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    const daily = dailyRef.current;
    if (!daily || state.phase !== 'connected') return;
    
    const newMuted = !isMuted;
    daily.setLocalAudio(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted, state.phase]);

  // Toggle video - sync with actual Daily state
  const handleToggleVideo = useCallback(async () => {
    const daily = dailyRef.current;
    if (!daily || state.phase !== 'connected' || state.call?.callType !== 'video') return;
    
    // Check actual current state from Daily
    const local = daily.participants()?.local;
    const currentlyHasVideo = local?.video === true;
    
    console.log('[CallOverlay] Toggle video, current state:', currentlyHasVideo);
    
    try {
      if (currentlyHasVideo) {
        await daily.setLocalVideo(false);
        setIsVideoOff(true);
        setCameraError(null);
      } else {
        // Turning video ON - may need to retry
        await daily.setLocalVideo(true);
        
        // Verify it worked
        setTimeout(() => {
          const p = daily.participants()?.local;
          if (p?.video) {
            setIsVideoOff(false);
            setCameraError(null);
          } else {
            setCameraError('Camera failed to enable');
          }
        }, 500);
      }
    } catch (err: any) {
      console.error('[CallOverlay] Toggle video error:', err);
      setCameraError(err.message || 'Failed to toggle camera');
    }
  }, [state.phase, state.call?.callType]);

  // Handle device changes from settings
  const handleMicChange = useCallback((deviceId: string) => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    daily.setInputDevicesAsync({ audioDeviceId: deviceId }).then(() => {
      setCurrentMicId(deviceId);
      toast.success('Microphone changed');
    }).catch((err) => {
      console.error('Failed to change mic:', err);
      toast.error('Failed to change microphone');
    });
  }, []);

  const handleCameraChange = useCallback((deviceId: string) => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    daily.setInputDevicesAsync({ videoDeviceId: deviceId }).then(() => {
      setCurrentCameraId(deviceId);
      toast.success('Camera changed');
    }).catch((err) => {
      console.error('Failed to change camera:', err);
      toast.error('Failed to change camera');
    });
  }, []);

  const handleSpeakerChange = useCallback((deviceId: string) => {
    const daily = dailyRef.current;
    if (!daily) return;
    
    daily.setOutputDeviceAsync({ outputDeviceId: deviceId }).then(() => {
      setCurrentSpeakerId(deviceId);
      toast.success('Speaker changed');
    }).catch((err) => {
      console.error('Failed to change speaker:', err);
      toast.error('Failed to change speaker');
    });
  }, []);

  // Accept incoming call
  const handleAccept = useCallback(async () => {
    if (!state.call) return;
    
    // Request permissions first
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
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get other user or group info
  const otherUser = state.call?.isInitiator ? state.call.receiver : state.call?.caller;
  const isGroupCall = state.call?.isGroupCall;
  const groupName = state.call?.groupName;
  const groupAvatar = state.call?.groupAvatar;
  
  // Display name: group name for group calls, or user's name for 1:1
  const displayName = isGroupCall && groupName 
    ? groupName 
    : (otherUser?.display_name || otherUser?.username);
  
  // Display avatar: group avatar or other user's avatar
  const displayAvatar = isGroupCall ? groupAvatar : otherUser?.avatar_url;
  
  // Get initials for avatar fallback
  const displayInitial = isGroupCall && groupName 
    ? groupName.charAt(0) 
    : (otherUser?.display_name?.charAt(0) || otherUser?.username?.charAt(0));
  
  const isVisible = state.phase !== 'idle';
  const isRinging = state.phase === 'ringing';
  const isConnected = state.phase === 'connected';
  const isConnecting = state.phase === 'creating' || state.phase === 'joining';
  // We're "ringing out" when connected to the room but waiting for the other person
  const isRingingOut = isConnected && !remoteParticipant && state.call?.isInitiator;
  
  // Show preloaded camera while Daily hasn't started yet (instant video like FaceTime)
  // Show it as soon as we have the stream, even before Daily is connected
  const showPreloadedLocalVideo = isVideoCall && cameraReady && preloadedStream && !hasLocalVideo && !isVideoOff;
  
  // Always show local video in video calls (either preloaded or Daily-managed)
  const showLocalVideoContainer = isVideoCall && (hasLocalVideo || showPreloadedLocalVideo) && !isVideoOff;

  return (
    <>
      {/* Main Call UI (not ringing) */}
      <AnimatePresence>
        {isVisible && !isRinging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[9999]"
            style={{
              background: 'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(240 10% 8%) 50%, hsl(280 20% 8%) 100%)'
            }}
          >
            {/* Ambient gradient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360]
                }}
                transition={{ 
                  duration: 20, 
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-30"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, hsl(var(--accent) / 0.3) 0%, transparent 50%)'
                }}
              />
            </div>

            {/* Hidden audio element for remote audio playback - CRITICAL for hearing remote user */}
            <audio
              ref={remoteAudioRef}
              autoPlay
              playsInline
              muted={false}
              className="hidden"
              style={{ display: 'none' }}
            />

            {/* Video Container */}
            {isVideoCall && (
              <>
                {/* Remote Video - Full Screen */}
                <div className="absolute inset-0">
                  {hasRemoteVideo ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {/* Remote avatar placeholder */}
                      <div className="relative">
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        >
                          <Avatar className="h-40 w-40 ring-4 ring-white/10 shadow-2xl">
                            <AvatarImage src={displayAvatar || undefined} />
                            <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                              {displayInitial}
                            </AvatarFallback>
                          </Avatar>
                        </motion.div>
                        {isRingingOut && (
                          <motion.p
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="mt-6 text-white/60 text-lg font-light text-center"
                          >
                            Ringing...
                          </motion.p>
                        )}
                        {!isConnected && !isRingingOut && (
                          <motion.p
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="mt-6 text-white/60 text-lg font-light text-center"
                          >
                            Waiting for video...
                          </motion.p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* iOS/iPad Tap to Start Video Overlay */}
                <AnimatePresence>
                  {needsUserInteraction && isConnected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30"
                      onClick={handleTapToStart}
                    >
                      <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        className="flex flex-col items-center gap-4 p-8"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary"
                        >
                          <Play className="w-10 h-10 text-primary" />
                        </motion.div>
                        <p className="text-white text-lg font-medium">Tap to start video</p>
                        <p className="text-white/60 text-sm text-center max-w-xs">
                          Your device requires a tap to enable video playback
                        </p>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Local Video - Picture-in-Picture (INSTANT - shows preloaded camera immediately) */}
                {showLocalVideoContainer && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-24 right-4 w-32 h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 bg-black"
                  >
                    {/* Show preloaded stream while Daily camera initializes - INSTANT like FaceTime */}
                    {showPreloadedLocalVideo && (
                      <video
                        ref={preloadVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover absolute inset-0 z-10"
                        style={{ transform: 'scaleX(-1)' }} // Mirror for selfie view
                      />
                    )}
                    {/* Daily-managed local video (takes over once ready) */}
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={cn(
                        "w-full h-full object-cover absolute inset-0",
                        hasLocalVideo ? "z-20" : "opacity-0"
                      )}
                      style={{ transform: 'scaleX(-1)' }} // Mirror for selfie view
                    />
                  </motion.div>
                )}

                {/* Camera Off Indicator (when local video is disabled) */}
                {!showLocalVideoContainer && isConnected && !isVideoOff && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-24 right-4 w-32 h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 bg-black/80 flex flex-col items-center justify-center"
                  >
                    <VideoOff className="w-8 h-8 text-white/50 mb-2" />
                    <p className="text-white/50 text-xs">Camera Off</p>
                    {cameraError && (
                      <p className="text-red-400 text-xs text-center px-2 mt-1">{cameraError}</p>
                    )}
                  </motion.div>
                )}

                {/* Camera Error / Retry Button */}
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
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRetryVideo}
                        disabled={isRetryingVideo}
                        className="h-10 px-4 rounded-lg bg-white/20 text-white flex items-center gap-2 hover:bg-white/30 disabled:opacity-50"
                      >
                        {isRetryingVideo ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span className="text-sm">Retry</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {/* Audio Call - Show Avatar */}
            {!isVideoCall && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  >
                    <Avatar className="h-40 w-40 mx-auto ring-4 ring-white/10 shadow-2xl">
                      <AvatarImage src={displayAvatar || undefined} />
                      <AvatarFallback className="text-5xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                        {displayInitial}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <h2 className="mt-6 text-2xl font-bold text-white">
                    {displayName}
                  </h2>
                  
                  {isConnecting && (
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="mt-2 text-white/60 text-lg"
                    >
                      Connecting...
                    </motion.p>
                  )}
                  
                  {isRingingOut && (
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="mt-2 text-white/60 text-lg"
                    >
                      Ringing...
                    </motion.p>
                  )}
                  
                  {isConnected && !isRingingOut && (
                    <p className="mt-2 text-white/70 text-lg font-mono">
                      {formatDuration(callDuration)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Glassmorphic Header */}
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="absolute top-0 left-0 right-0 pointer-events-auto"
            >
              <div className="mx-4 mt-4 p-4 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12 ring-2 ring-white/20 shadow-lg">
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">
                          {displayInitial}
                        </AvatarFallback>
                      </Avatar>
                      {isConnected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black/50"
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-lg">
                        {displayName}
                      </p>
                      <div className="flex items-center gap-2">
                        {isConnecting && (
                          <motion.div 
                            className="flex items-center gap-2 text-white/60"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                            <span className="text-sm">Connecting</span>
                          </motion.div>
                        )}
                        {isRingingOut && (
                          <motion.div 
                            className="flex items-center gap-2 text-white/60"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          >
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
                            <span className="text-white/70 text-sm font-mono tracking-wide">
                              {formatDuration(callDuration)}
                            </span>
                          </div>
                        )}
                        {state.phase === 'error' && (
                          <span className="text-red-400 text-sm">{state.error}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Call type badge */}
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
                      {isVideoCall ? (
                        <Video className="h-4 w-4 text-white/70" />
                      ) : (
                        <Phone className="h-4 w-4 text-white/70" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Connecting overlay */}
            <AnimatePresence>
              {isConnecting && isVideoCall && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                >
                  <div className="text-center">
                    {/* Animated rings */}
                    <div className="relative">
                      <motion.div
                        animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                        className="absolute inset-0 rounded-full border-2 border-primary/50"
                        style={{ width: 140, height: 140, margin: 'auto', left: 0, right: 0, top: 0, bottom: 0 }}
                      />
                      <motion.div
                        animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }}
                        className="absolute inset-0 rounded-full border-2 border-accent/40"
                        style={{ width: 140, height: 140, margin: 'auto', left: 0, right: 0, top: 0, bottom: 0 }}
                      />
                      
                      <Avatar className="h-32 w-32 mx-auto ring-4 ring-primary/20 shadow-2xl">
                        <AvatarImage src={displayAvatar || undefined} />
                        <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                          {displayInitial}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="mt-6 text-white/60 text-lg font-light"
                    >
                      Connecting to {displayName}...
                    </motion.p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Modern Control Bar */}
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", damping: 25 }}
              className="absolute bottom-0 left-0 right-0 pb-10 pointer-events-auto"
            >
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/10 shadow-2xl">
                  {/* Settings Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
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

                  {/* Divider */}
                  <div className="w-px h-10 bg-white/20 mx-1" />

                  {/* Mute Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleToggleMute}
                    disabled={!isConnected}
                    className={cn(
                      "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      isMuted 
                        ? "bg-white text-black shadow-lg ring-2 ring-primary/50" 
                        : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    {/* Active indicator glow */}
                    {!isMuted && isConnected && (
                      <motion.div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{ boxShadow: '0 0 15px hsl(var(--primary) / 0.3)' }}
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </motion.button>

                  {/* Video Toggle */}
                  {isVideoCall && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleToggleVideo}
                      disabled={!isConnected}
                      className={cn(
                        "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isVideoOff || (!hasLocalVideo && !showPreloadedLocalVideo)
                          ? "bg-white text-black shadow-lg ring-2 ring-accent/50" 
                          : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {(isVideoOff || (!hasLocalVideo && !showPreloadedLocalVideo)) ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                      {/* Active indicator glow for video */}
                      {!isVideoOff && hasLocalVideo && isConnected && (
                        <motion.div
                          className="absolute inset-0 rounded-xl pointer-events-none"
                          style={{ boxShadow: '0 0 15px hsl(var(--accent) / 0.3)' }}
                          animate={{ opacity: [0.3, 0.6, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  )}

                  {/* Retry Video Button - shown when camera has error */}
                  {isVideoCall && cameraError && isConnected && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRetryVideo}
                      disabled={isRetryingVideo}
                      className={cn(
                        "relative h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-300",
                        "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isRetryingVideo ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-5 w-5" />
                      )}
                    </motion.button>
                  )}

                  {/* Divider */}
                  <div className="w-px h-10 bg-white/20 mx-1" />

                  {/* End Call Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleHangup}
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
                        <span className="font-medium">End</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              background:
                'linear-gradient(135deg, hsl(240 10% 4%) 0%, hsl(280 20% 8%) 50%, hsl(240 10% 6%) 100%)',
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

      {/* Call Settings Sheet */}
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

// Incoming call dialog component with instant camera preview
function IncomingCallDialog({
  call,
  onAccept,
  onDecline,
}: {
  call: CallData;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  
  const isVideoCall = call.callType === 'video';
  const caller = call.caller;
  const isGroupCall = call.isGroupCall;
  const groupName = call.groupName;
  const groupAvatar = call.groupAvatar;
  
  // For incoming calls: show group name if group call, otherwise caller info
  const incomingDisplayName = isGroupCall && groupName 
    ? groupName 
    : (caller?.display_name || caller?.username);
  const incomingDisplayAvatar = isGroupCall ? groupAvatar : caller?.avatar_url;
  const incomingDisplayInitial = isGroupCall && groupName 
    ? groupName.charAt(0) 
    : (caller?.display_name?.charAt(0) || caller?.username?.charAt(0));
  
  // Preload camera for video calls - shows your face immediately
  const { stream: preloadedStream, isReady: cameraReady } = useCameraPreload(isVideoCall);
  
  // Attach preloaded stream to preview video
  useEffect(() => {
    if (cameraPreviewRef.current && preloadedStream && cameraReady) {
      cameraPreviewRef.current.srcObject = preloadedStream;
      cameraPreviewRef.current.play().catch(console.error);
    }
  }, [preloadedStream, cameraReady]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onDecline();
          return 0;
        }
        return prev - 1;
      });
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
      {/* Your camera preview in background for video calls - FaceTime style */}
      {isVideoCall && cameraReady && preloadedStream && (
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={cameraPreviewRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover opacity-30"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        </div>
      )}
      
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }}
        />
      </div>

      {!isVideoCall && <div className="absolute inset-0 backdrop-blur-3xl" />}

      <motion.div
        initial={{ scale: 0.8, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative z-10 flex flex-col items-center max-w-sm w-full"
      >
        {/* Avatar with animated rings */}
        <div className="relative mb-8">
          {/* Pulsing rings */}
          <motion.div
            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-primary/50"
            style={{ width: 144, height: 144, margin: '-8px' }}
          />
          <motion.div
            animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
            transition={{ repeat: Infinity, duration: 2, delay: 0.5, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border-2 border-accent/40"
            style={{ width: 144, height: 144, margin: '-8px' }}
          />
          
          <motion.div
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            <Avatar className="h-32 w-32 ring-4 ring-white/10 shadow-2xl">
              <AvatarImage src={incomingDisplayAvatar || undefined} />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-primary via-purple-500 to-accent text-white font-bold">
                {incomingDisplayInitial}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          {/* Call type badge */}
          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2"
          >
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-accent flex items-center gap-1.5 shadow-lg">
              {isVideoCall ? <Video className="h-4 w-4 text-white" /> : <Phone className="h-4 w-4 text-white" />}
              <span className="text-xs font-semibold text-white">
                {isGroupCall 
                  ? (isVideoCall ? 'Group FaceTime' : 'Group Call')
                  : (isVideoCall ? 'FaceTime' : 'Audio Call')
                }
              </span>
            </div>
          </motion.div>
        </div>

        {/* Caller info */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">
            {incomingDisplayName}
          </h2>
          <motion.p
            className="text-white/60 text-lg"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {isGroupCall 
              ? `${caller?.display_name || caller?.username} is calling...`
              : 'is calling you...'
            }
          </motion.p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-8 w-full mb-8">
          {/* Decline button */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleDecline}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleDecline();
              }}
              disabled={isProcessing}
              className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg flex items-center justify-center hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-white/50 text-sm font-medium">Decline</span>
          </div>

          {/* Accept button */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleAccept}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleAccept();
              }}
              disabled={isProcessing}
              className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg flex items-center justify-center hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 touch-manipulation active:scale-90 animate-pulse"
            >
              {isVideoCall ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </button>
            <span className="text-white/50 text-sm font-medium">Accept</span>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
          <span>Auto-declining in {timeLeft}s</span>
        </div>
      </motion.div>
    </>
  );
}
