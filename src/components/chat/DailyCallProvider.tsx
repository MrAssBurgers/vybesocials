import { useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { DailyCall, useIncomingDailyCalls, useDailyCallState } from '@/hooks/useDailyCalls';
import { DailyIncomingCallDialog } from './DailyIncomingCallDialog';
import { DailyCallRoot } from './DailyCallRoot';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';

interface DailyCallContextType {
  activeCall: DailyCall | null;
  callPhase: 'idle' | 'ringing' | 'connecting' | 'connected';
  startCall: (call: DailyCall) => void;
  endCall: () => void;
}

const DailyCallContext = createContext<DailyCallContextType>({
  activeCall: null,
  callPhase: 'idle',
  startCall: () => {},
  endCall: () => {},
});

export function useDailyCallContext() {
  return useContext(DailyCallContext);
}

interface DailyCallProviderProps {
  children: ReactNode;
}

export function DailyCallProvider({ children }: DailyCallProviderProps) {
  const { profile } = useAuth();
  const { incomingCall, dismissIncomingCall } = useIncomingDailyCalls();
  const { activeCall, isInitiator, callPhase, startCall: setCall, endCall, setConnected } = useDailyCallState();

  // CRITICAL: Track if we're currently processing an accept to prevent double-accept
  const isAcceptingRef = useRef(false);

  const startCall = useCallback((call: DailyCall) => {
    setCall(call, call.caller_id === profile?.id);
  }, [profile?.id, setCall]);

  const handleAcceptCall = useCallback(async (call: DailyCall) => {
    if (isAcceptingRef.current) {
      console.log('[DailyCallProvider] Already accepting call, ignoring');
      return;
    }
    isAcceptingRef.current = true;

    console.log('[DailyCallProvider] Accepting call:', call.id);
    dismissIncomingCall();
    callSounds.stopAll();

    // Small delay for smooth transition, then set call
    setTimeout(() => {
      setCall(call, false);
      setTimeout(() => {
        isAcceptingRef.current = false;
      }, 500);
    }, 100);
  }, [dismissIncomingCall, setCall]);

  const handleDeclineCall = useCallback(() => {
    console.log('[DailyCallProvider] Declining call');
    dismissIncomingCall();
  }, [dismissIncomingCall]);

  const handleCloseCall = useCallback(() => {
    console.log('[DailyCallProvider] Closing call');
    callSounds.stopAll();
    endCall();
  }, [endCall]);

  return (
    <DailyCallContext.Provider value={{ activeCall, callPhase, startCall, endCall }}>
      {children}

      {/* Incoming call dialog - only show if no active call */}
      <AnimatePresence>
        {incomingCall && !activeCall && !isAcceptingRef.current && (
          <DailyIncomingCallDialog
            call={incomingCall}
            onAccept={handleAcceptCall}
            onDecline={handleDeclineCall}
          />
        )}
      </AnimatePresence>

      {/* SINGLE, PERMANENT Daily root (iframe mounted once, never conditional) */}
      <DailyCallRoot
        activeCall={activeCall}
        isInitiator={isInitiator}
        callPhase={callPhase}
        onClose={handleCloseCall}
        onConnected={setConnected}
      />
    </DailyCallContext.Provider>
  );
}

