import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

  const openCall = useCallback((params: {
    roomUrl: string;
    roomName: string;
    callType: 'audio' | 'video';
    conversationId: string;
  }) => {
    console.log('[CALL DEBUG] CallOverlayProvider.openCall called with:', params);

    // Only validate roomUrl exists (do NOT block on existing call state)
    if (!params.roomUrl) {
      console.error('[CALL DEBUG] openCall aborted: roomUrl is required');
      return;
    }

    // Always open (no early-return guards)
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
    <CallOverlayContext.Provider value={{ state, openCall, closeCall }}>
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
