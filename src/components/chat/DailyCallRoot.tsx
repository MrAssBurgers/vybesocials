import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { callSounds } from '@/lib/callSounds';
import { DailyCall, useEndDailyCall, useGetCallToken } from '@/hooks/useDailyCalls';
import { DailyCallUI } from './DailyCallUI';
import { CallFallbackModal, FallbackOption } from './CallFallbackModal';
import { ExternalCallSheet } from './ExternalCallSheet';
import { useCallFallback } from '@/hooks/useCallFallback';
import {
  ensureDailyFrame,
  getDailyInstance,
  getCurrentRoomUrl,
  isCurrentlyJoining,
  joinRoom,
  leaveRoom,
  destroyDailyInstance,
} from '@/lib/dailySingleton';
import { ensureAudioInputDevice, isAndroid, nextAnimationFrame, requestCallMediaPermissions } from '@/lib/mediaPermissions';

interface DailyCallRootProps {
  activeCall: DailyCall | null;
  isInitiator: boolean;
  callPhase: 'idle' | 'ringing' | 'connecting' | 'connected';
  onClose: () => void;
  onConnected: () => void;
}

function isValidRoomUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://') && url.length >= 20;
}

export function DailyCallRoot({
  activeCall,
  isInitiator,
  callPhase,
  onClose,
  onConnected,
}: DailyCallRootProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const joinAttemptedRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFailingRef = useRef(false);
  const joinedHandlerRef = useRef<(() => void) | null>(null);
  const errorHandlerRef = useRef<((event: any) => void) | null>(null);
  const [callToken, setCallToken] = useState<string | null>(null);
  const [showExternalSheet, setShowExternalSheet] = useState(false);
  const [audioOnlyRetry, setAudioOnlyRetry] = useState(false);

  // Call fallback system for restricted networks
  const {
    failureCount,
    showFallbackModal,
    recordFailure,
    resetFailures,
    hideFallbackModal,
    shouldShowFallbackProactively,
  } = useCallFallback();

  const dailyFrameOptions = useMemo(
    () => ({
      iframeStyle: {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        border: 'none',
      },
      showLeaveButton: false,
      showFullscreenButton: false,
    }),
    []
  );

  const activeCallRef = useRef<DailyCall | null>(activeCall);
  const callPhaseRef = useRef(callPhase);
  const onCloseRef = useRef(onClose);
  const onConnectedRef = useRef(onConnected);

  const endCallMutation = useEndDailyCall();
  const getTokenMutation = useGetCallToken();

  useEffect(() => {
    activeCallRef.current = activeCall;
    callPhaseRef.current = callPhase;
    onCloseRef.current = onClose;
    onConnectedRef.current = onConnected;

    // Reset per-call guards
    joinAttemptedRef.current = false;
    isFailingRef.current = false;
    setCallToken(null);
  }, [activeCall?.id]);

  const isVisible = useMemo(() => {
    return !!activeCall && callPhase !== 'idle';
  }, [activeCall, callPhase]);

  const clearJoinTimeout = () => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  };

  const failAndEnd = async (message: string, skipFallback = false) => {
    if (isFailingRef.current) return;
    isFailingRef.current = true;

    clearJoinTimeout();

    // Record the failure and check if we should show fallback
    const shouldShowFallback = !skipFallback && recordFailure(message);
    
    if (!shouldShowFallback) {
      toast.error(message);
    }

    try {
      await leaveRoom();
    } catch {
      // ignore
    }

    // FAILSAFE: hard-reset the call object/iframe so we can restart cleanly after failures/timeouts
    try {
      const joined = joinedHandlerRef.current;
      const onErr = errorHandlerRef.current;
      const current = getDailyInstance();
      if (current && joined && onErr) {
        current.off('joined-meeting', joined);
        current.off('error', onErr);
      }

      await destroyDailyInstance();

      if (containerRef.current && joined && onErr) {
        const next = ensureDailyFrame(containerRef.current, dailyFrameOptions);
        next.on('joined-meeting', joined);
        next.on('error', onErr);
      }
    } catch {
      // ignore
    }

    const callId = activeCallRef.current?.id;
    if (callId) {
      try {
        await endCallMutation.mutateAsync(callId);
      } catch (e) {
        console.error('[DailyCallRoot] Failed to mark call ended:', e);
      }
    }

    // If showing fallback, don't close yet - let user choose an option
    if (!shouldShowFallback) {
      onCloseRef.current();
    }
  };

  // Handle fallback option selection
  const handleFallbackOption = async (option: FallbackOption) => {
    hideFallbackModal();
    
    switch (option) {
      case 'phone':
        // Phone fallback - show info about setting up phone
        toast.info('Phone calling requires phone verification. Go to Settings to set up.');
        onCloseRef.current();
        break;
        
      case 'audio-only':
        // Retry with audio-only mode
        setAudioOnlyRetry(true);
        toast.info('Retrying with audio-only mode...');
        // Reset state to allow retry
        joinAttemptedRef.current = false;
        isFailingRef.current = false;
        // The useEffect will pick up the retry
        break;
        
      case 'external':
        // Show external call sheet
        setShowExternalSheet(true);
        break;
        
      case 'cancel':
      default:
        onCloseRef.current();
        break;
    }
  };

  // Get other user info for fallback UI
  const otherUser = useMemo(() => {
    if (!activeCall) return null;
    return isInitiator ? activeCall.receiver : activeCall.caller;
  }, [activeCall, isInitiator]);

  // 1) Mount Daily iframe ONCE at app load (never conditional)
  useEffect(() => {
    if (!containerRef.current) return;

    const daily = ensureDailyFrame(containerRef.current, dailyFrameOptions);

    // Attach listeners ONCE (handlers use refs for latest call state)
    const handleJoined = () => {
      clearJoinTimeout();
      isFailingRef.current = false;
      
      // Reset failure count on successful connection
      resetFailures();

      const currentCall = activeCallRef.current;
      if (currentCall?.call_type === 'audio') {
        daily.setLocalVideo(false);
      }
      daily.setLocalAudio(true);

      callSounds.stopAll();
      callSounds.connect();
      onConnectedRef.current();
    };

    const handleError = (event: any) => {
      console.error('[DailyCallRoot] Daily error event:', event);

      const msg =
        event?.errorMsg ||
        event?.error?.msg ||
        event?.error ||
        'Call failed to connect. Check permissions or network.';

      void failAndEnd(typeof msg === 'string' ? msg : 'Call failed to connect. Check permissions or network.');
    };

    // Save handlers so we can re-bind them after a hard reset
    joinedHandlerRef.current = handleJoined;
    errorHandlerRef.current = handleError;

    daily.on('joined-meeting', handleJoined);
    daily.on('error', handleError);

    return () => {
      // Root should not unmount in normal operation, but keep this safe.
      daily.off('joined-meeting', handleJoined);
      daily.off('error', handleError);
    };
  }, []);

  // 2) Token fetch + Join flow (join exactly once per call, without remounting iframe)
  useEffect(() => {
    // If no call, ensure we're not in a room
    if (!activeCall || callPhase === 'idle') {
      clearJoinTimeout();
      joinAttemptedRef.current = false;
      setCallToken(null);
      void leaveRoom();
      return;
    }

    // Do not join while ringing (initiator waits for accept)
    if (callPhase === 'ringing') return;

    // Validate room URL
    if (!isValidRoomUrl(activeCall.room_url)) {
      void failAndEnd('Invalid call room URL');
      return;
    }

    // Validate room name exists
    if (!activeCall.room_name) {
      void failAndEnd('Missing room name');
      return;
    }

    // Secure context requirement (HTTPS)
    if (typeof window !== 'undefined' && (!window.isSecureContext || window.location.protocol !== 'https:')) {
      void failAndEnd('Calls require a secure (HTTPS) connection');
      return;
    }

    // Prevent duplicate join attempts
    if (joinAttemptedRef.current) return;
    if (isCurrentlyJoining()) return;
    if (getCurrentRoomUrl() === activeCall.room_url) return;

    joinAttemptedRef.current = true;

    // 15s failsafe
    clearJoinTimeout();
    joinTimeoutRef.current = setTimeout(() => {
      void failAndEnd('Call failed to connect. Check permissions or network.');
    }, 15000);

    // Fetch token first, then join
    const doJoin = async () => {
      try {
        // If audio-only retry, only request microphone
        const callType = audioOnlyRetry ? 'audio' : activeCall.call_type;
        
        // MANDATORY: only join after media permissions are granted
        await requestCallMediaPermissions(callType);
        await ensureAudioInputDevice();

        // ANDROID SAFETY: wait one animation frame after permission resolution
        if (isAndroid()) {
          await nextAnimationFrame();
        }

        // Get meeting token from backend
        const tokenData = await getTokenMutation.mutateAsync({
          roomName: activeCall.room_name!,
          callId: activeCall.id,
        });

        setCallToken(tokenData.token);

        // Join with token
        await joinRoom(activeCall.room_url!, tokenData.token);
        
        // If audio-only retry succeeded, disable video after joining
        if (audioOnlyRetry) {
          const daily = getDailyInstance();
          if (daily) {
            daily.setLocalVideo(false);
          }
        }
      } catch (err: any) {
        console.error('[DailyCallRoot] join failed:', err);
        const msg = err?.message || 'Call failed to connect. Check permissions or network.';
        void failAndEnd(msg);
      }
    };

    doJoin();
  }, [activeCall?.id, activeCall?.room_url, activeCall?.room_name, callPhase, audioOnlyRetry]);

  // Ensure we leave the room when the call ends in the DB (remote hangup)
  useEffect(() => {
    if (callPhase === 'idle' || !activeCall) {
      clearJoinTimeout();
      joinAttemptedRef.current = false;
      setCallToken(null);
      void leaveRoom();
    }
  }, [callPhase, activeCall]);

  // NOTE: We intentionally do NOT destroy the Daily instance between calls.
  // This guarantees only ONE iframe exists in the DOM and prevents duplicate-instance crashes.

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[9999] transition-opacity duration-150',
          isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Permanent Daily iframe layer (mounted once) */}
        <div ref={containerRef} className="absolute inset-0 z-0" />

        {/* UI overlay layer (does NOT contain the iframe) */}
        <div className="absolute inset-0 z-10">
          <AnimatePresence>
            {activeCall && callPhase !== 'idle' && (
              <DailyCallUI
                key={activeCall.id}
                call={activeCall}
                isInitiator={isInitiator}
                callPhase={callPhase as 'ringing' | 'connecting' | 'connected'}
                onClose={onClose}
                onConnected={onConnected}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Call Fallback Modal - shown when WebRTC fails on restricted networks */}
      <CallFallbackModal
        open={showFallbackModal}
        onClose={() => {
          hideFallbackModal();
          onClose();
        }}
        onSelectOption={handleFallbackOption}
        failureCount={failureCount}
        otherUserName={otherUser?.display_name || otherUser?.username}
        otherUserPhone={null} // TODO: Add phone number from profile when available
      />

      {/* External Call Options Sheet */}
      <ExternalCallSheet
        open={showExternalSheet}
        onClose={() => {
          setShowExternalSheet(false);
          onClose();
        }}
        otherUserPhone={null} // TODO: Add phone number from profile when available
        otherUserName={otherUser?.display_name || otherUser?.username}
      />
    </>
  );
}
