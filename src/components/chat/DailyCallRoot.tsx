import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { callSounds } from '@/lib/callSounds';
import { DailyCall, useEndDailyCall, useGetCallToken } from '@/hooks/useDailyCalls';
import { DailyCallUI } from './DailyCallUI';
import {
  ensureDailyFrame,
  getDailyInstance,
  getCurrentRoomUrl,
  isCurrentlyJoining,
  joinRoom,
  leaveRoom,
} from '@/lib/dailySingleton';

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
  const [callToken, setCallToken] = useState<string | null>(null);

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

  const failAndEnd = async (message: string) => {
    if (isFailingRef.current) return;
    isFailingRef.current = true;

    clearJoinTimeout();
    toast.error(message);

    try {
      await leaveRoom();
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

    onCloseRef.current();
  };

  // 1) Mount Daily iframe ONCE at app load (never conditional)
  useEffect(() => {
    if (!containerRef.current) return;

    const daily = ensureDailyFrame(containerRef.current, {
      iframeStyle: {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        border: 'none',
      },
      showLeaveButton: false,
      showFullscreenButton: false,
    });

    // Attach listeners ONCE (handlers use refs for latest call state)
    const handleJoined = () => {
      clearJoinTimeout();
      isFailingRef.current = false;

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
        // Get meeting token from backend
        const tokenData = await getTokenMutation.mutateAsync({
          roomName: activeCall.room_name!,
          callId: activeCall.id,
        });

        setCallToken(tokenData.token);

        // Join with token
        await joinRoom(activeCall.room_url!, tokenData.token);
      } catch (err: any) {
        console.error('[DailyCallRoot] join failed:', err);
        const msg = err?.message || 'Call failed to connect. Check permissions or network.';
        void failAndEnd(msg);
      }
    };

    doJoin();
  }, [activeCall?.id, activeCall?.room_url, activeCall?.room_name, callPhase]);

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
  );
}
