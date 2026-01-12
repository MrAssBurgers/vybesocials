import { useState, useCallback, createContext, useContext, ReactNode, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { DailyCall, useIncomingDailyCalls, useDailyCallState } from '@/hooks/useDailyCalls';
import { DailyCallUI } from './DailyCallUI';
import { DailyIncomingCallDialog } from './DailyIncomingCallDialog';
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
  
  // CRITICAL: Track if we're currently processing an accept to prevent double-mount
  const isAcceptingRef = useRef(false);

  const startCall = useCallback((call: DailyCall) => {
    setCall(call, call.caller_id === profile?.id);
  }, [profile?.id, setCall]);

  const handleAcceptCall = useCallback(async (call: DailyCall) => {
    // CRITICAL: Prevent double-accept
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
      // Reset the flag after call is set
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

      {/* Active call UI - only render ONCE per call */}
      <AnimatePresence>
        {activeCall && callPhase !== 'idle' && (
          <DailyCallUI
            key={activeCall.id} // CRITICAL: Key by call ID to prevent re-mount
            call={activeCall}
            isInitiator={isInitiator}
            callPhase={callPhase as 'ringing' | 'connecting' | 'connected'}
            onClose={handleCloseCall}
            onConnected={setConnected}
          />
        )}
      </AnimatePresence>
    </DailyCallContext.Provider>
  );
}
