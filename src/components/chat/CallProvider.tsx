import { useState, useCallback, useEffect, createContext, useContext, ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Call, useIncomingCalls } from '@/hooks/useCalls';
import { CallUI } from './CallUI';
import { IncomingCallDialog } from './IncomingCallDialog';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

interface CallContextType {
  activeCall: Call | null;
  startCall: (call: Call) => void;
  endCall: () => void;
}

const CallContext = createContext<CallContextType>({
  activeCall: null,
  startCall: () => {},
  endCall: () => {},
});

export function useCallContext() {
  return useContext(CallContext);
}

interface CallProviderProps {
  children: ReactNode;
}

export function CallProvider({ children }: CallProviderProps) {
  const { profile } = useAuth();
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);

  const { incomingCall, dismissIncomingCall } = useIncomingCalls();

  const startCall = useCallback((call: Call) => {
    setActiveCall(call);
    setIsInitiator(call.caller_id === profile?.id);
  }, [profile?.id]);

  const endCall = useCallback(() => {
    setActiveCall(null);
    setIsInitiator(false);
  }, []);

  // Listen for call status changes on the active call - CRITICAL for hangup sync
  useEffect(() => {
    if (!activeCall?.id) return;

    const channel = supabase
      .channel(`active-call-status:${activeCall.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${activeCall.id}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          
          // If call is ended or declined, clear the active call
          if (newStatus === 'ended' || newStatus === 'declined') {
            console.log('Call status changed to ended/declined, clearing active call');
            setActiveCall(null);
            setIsInitiator(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCall?.id]);

  const handleAcceptCall = useCallback(async (call: Call) => {
    dismissIncomingCall();
    
    // Small delay for smooth transition
    setTimeout(() => {
      setActiveCall(call);
      setIsInitiator(false);
    }, 100);
  }, [dismissIncomingCall]);

  const handleDeclineCall = useCallback(() => {
    dismissIncomingCall();
  }, [dismissIncomingCall]);

  return (
    <CallContext.Provider value={{ activeCall, startCall, endCall }}>
      {children}

      {/* Incoming call dialog */}
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <IncomingCallDialog
            call={incomingCall}
            onAccept={handleAcceptCall}
            onDecline={handleDeclineCall}
          />
        )}
      </AnimatePresence>

      {/* Active call UI */}
      <AnimatePresence>
        {activeCall && (
          <CallUI
            call={activeCall}
            isInitiator={isInitiator}
            onClose={endCall}
          />
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
}
