import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

interface CallOverlayState {
  isOpen: boolean;
  roomUrl: string | null;
  roomName: string | null;
  callType: 'audio' | 'video' | null;
  conversationId: string | null;
}

interface CallOverlayContextType {
  state: CallOverlayState;
  openCall: (params: {
    roomUrl: string;
    roomName: string;
    callType: 'audio' | 'video';
    conversationId: string;
  }) => void;
  closeCall: () => void;
  forceCleanup: () => void;
  cleanupRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

const initialState: CallOverlayState = {
  isOpen: false,
  roomUrl: null,
  roomName: null,
  callType: null,
  conversationId: null,
};

const CallOverlayContext = createContext<CallOverlayContextType | null>(null);

export function CallOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CallOverlayState>(initialState);
  // Ref to hold cleanup function from CallOverlay
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  const forceCleanup = useCallback(async () => {
    console.log('[CALL DEBUG] forceCleanup called');
    if (cleanupRef.current) {
      await cleanupRef.current();
    }
  }, []);

  const openCall = useCallback(async (params: {
    roomUrl: string;
    roomName: string;
    callType: 'audio' | 'video';
    conversationId: string;
  }) => {
    console.log('[CALL DEBUG] CallOverlayProvider.openCall called with:', params);
    
    // Validate roomUrl exists
    if (!params.roomUrl) {
      console.error('[CALL DEBUG] openCall failed: roomUrl is required');
      return;
    }
    
    // ALWAYS force cleanup any existing call first
    console.log('[CALL DEBUG] Force cleanup before opening new call');
    if (cleanupRef.current) {
      await cleanupRef.current();
    }
    
    // Reset and open with new params
    console.log('[CALL DEBUG] Setting CallOverlay state to open');
    setState({
      isOpen: true,
      roomUrl: params.roomUrl,
      roomName: params.roomName,
      callType: params.callType,
      conversationId: params.conversationId,
    });
  }, []);

  const closeCall = useCallback(() => {
    console.log('[CALL DEBUG] CallOverlayProvider.closeCall called');
    setState(initialState);
  }, []);

  return (
    <CallOverlayContext.Provider value={{ state, openCall, closeCall, forceCleanup, cleanupRef }}>
      {children}
    </CallOverlayContext.Provider>
  );
}

export function useCallOverlay() {
  const context = useContext(CallOverlayContext);
  if (!context) {
    throw new Error('useCallOverlay must be used within CallOverlayProvider');
  }
  return context;
}
