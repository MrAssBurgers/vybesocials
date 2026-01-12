import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
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

  const startCall = useCallback((call: DailyCall) => {
    setCall(call, call.caller_id === profile?.id);
  }, [profile?.id, setCall]);

  const handleAcceptCall = useCallback(async (call: DailyCall) => {
    dismissIncomingCall();
    callSounds.stopAll();
    
    // Small delay for smooth transition
    setTimeout(() => {
      setCall(call, false);
    }, 100);
  }, [dismissIncomingCall, setCall]);

  const handleDeclineCall = useCallback(() => {
    dismissIncomingCall();
  }, [dismissIncomingCall]);

  const handleCloseCall = useCallback(() => {
    callSounds.stopAll();
    endCall();
  }, [endCall]);

  return (
    <DailyCallContext.Provider value={{ activeCall, callPhase, startCall, endCall }}>
      {children}

      {/* Incoming call dialog */}
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <DailyIncomingCallDialog
            call={incomingCall}
            onAccept={handleAcceptCall}
            onDecline={handleDeclineCall}
          />
        )}
      </AnimatePresence>

      {/* Active call UI */}
      <AnimatePresence>
        {activeCall && callPhase !== 'idle' && (
          <DailyCallUI
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
